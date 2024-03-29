import { Scopes } from '@vivocha/scopes';
import { getLogger, Logger } from 'debuggo';
import { Eredita } from 'eredita';
import express, { NextFunction, Request, Response, Router, RouterOptions } from 'express';
import http from 'http';
import https from 'https';
import _ from 'lodash';
import needle from 'needle';
import { OpenAPIV3, parse, ParseOptions, rebase, SchemaObject, ValidationError } from 'openapi-police';
import semver from 'semver';
import { deprecate } from 'util';
import { DEFAULT_DOCUMENT } from './defaults.js';
import { RESTError } from './error.js';
import { Resource } from './resource.js';
import { SchemaResource } from './schema.js';
import { APIRequest, APIResponse } from './types.js';
import { rebaseOASDefinitions, refsRebaser, removeSchemaDeclaration, removeUnusedSchemas } from './util.js';

let reqId: number = 0;

export class API {
  public document: OpenAPIV3.Document;

  protected logger: Logger;
  protected resources: Resource[];
  readonly originalSchemas: {
    [name: string]: OpenAPIV3.SchemaObject;
  } = {};
  protected dynamicSchemas: {
    [name: string]: SchemaObject;
  } = {};
  protected internalRouter: Promise<Router>;
  protected parseOptions: ParseOptions;

  constructor(info?: OpenAPIV3.InfoObject) {
    this.document = Eredita.deepExtend(_.cloneDeep(DEFAULT_DOCUMENT), { info: info || {} });
    if (!semver.valid(this.document.info.version)) {
      throw new Error('Invalid version');
    }
    this.logger = getLogger(this.getDebugLabel(), undefined, false);
    this.resources = [];
    this.parseOptions = {
      scope: 'http://vivocha.com/api/v3',
      retriever: this.defaultSchemaRetriever.bind(this),
    };
  }

  protected getDebugLabel(): string {
    return 'arrest';
  }
  protected getDebugContext(): string {
    return `#${++reqId}`;
  }
  protected async defaultSchemaRetriever(url: string): Promise<any> {
    const response = await needle('get', url);
    if (response.statusCode !== 200) {
      throw new RESTError(response.statusCode as number);
    }
    return response.body;
  }

  addResource(resource: Resource): this {
    this.resources.push(resource);
    resource.attach(this);
    return this;
  }

  registerSchema(name: string, schema: OpenAPIV3.SchemaObject) {
    this.originalSchemas[name] = _.cloneDeep(schema);
    if (!this.document.components) {
      this.document.components = {};
    }
    if (!this.document.components.schemas) {
      this.document.components.schemas = {};
    }
    this.document.components.schemas[name] = removeSchemaDeclaration(rebase(name, _.cloneDeep(schema), refsRebaser));
  }
  registerDynamicSchema(name: string, schema: SchemaObject) {
    this.dynamicSchemas[name] = schema;
  }
  registerOperation(path: string, method: string, operation: OpenAPIV3.OperationObject): () => OpenAPIV3.OperationObject {
    if (!this.document.paths) {
      this.document.paths = {};
    }
    let _path = path;
    if (_path.length > 1 && _path[_path.length - 1] === '/') {
      _path = _path.substr(0, _path.length - 1);
    }
    if (!this.document.paths[_path]) {
      this.document.paths[_path] = {};
    }
    this.document.paths[_path][method] = operation;
    return () => this.document.paths[_path][method];
  }
  registerTag(tag: OpenAPIV3.TagObject) {
    if (!this.document.tags) {
      this.document.tags = [];
    }
    this.document.tags.push(tag);
  }
  registerOauth2Scope(name: string, description: string): void {
    const oauth2Defs: OpenAPIV3.OAuth2SecurityScheme[] = this.getOauth2Schemes();
    oauth2Defs.forEach((i) => {
      for (let f in i.flows) {
        const flow = i.flows[f];
        if (!flow.scopes) {
          flow.scopes = {};
        }
        flow.scopes[name] = description;
      }
    });
  }
  getOauth2Schemes(): OpenAPIV3.OAuth2SecurityScheme[] {
    const out: OpenAPIV3.OAuth2SecurityScheme[] = [];
    if (this.document.components && this.document.components.securitySchemes) {
      const schemes = this.document.components.securitySchemes;
      for (let k in schemes) {
        const s = schemes[k] as OpenAPIV3.OAuth2SecurityScheme;
        if (s.type === 'oauth2') {
          out.push(s);
        }
      }
    }
    return out;
  }

  async listen(httpPort: number, httpsPort?: number, httpsOptions?: https.ServerOptions): Promise<any> {
    if (!httpPort && !httpsPort) {
      throw new Error('no listen ports specified');
    }
    let router = await this.router();
    let app = express();
    app.use(router);
    app.use(API.handle404Error);
    let out: any[] = [];
    if (httpsPort) {
      if (!httpsOptions) {
        throw new Error('no https options');
      } else {
        out.push(https.createServer(httpsOptions, app).listen(httpsPort));
      }
    }
    if (httpPort) {
      out.push(http.createServer(app).listen(httpPort));
    }
    return out.length == 1 ? out[0] : out;
  }

  router(options?: RouterOptions): Promise<Router> {
    if (!this.internalRouter) {
      this.internalRouter = (async () => {
        this.logger.info('creating router');
        const router = Router(options);
        router.use((_req: Request, res: Response, next: NextFunction) => {
          let req: APIRequest = _req as APIRequest;
          if (!req.logger) {
            req.logger = getLogger(this.getDebugLabel(), this.getDebugContext(), false);
          }
          next();
        });

        if (this.securityValidator !== API.prototype.securityValidator) {
          router.use(deprecate(this.securityValidator, 'API.securityValidator is deprecated. Use API.initSecurity instead.').bind(this));
        } else {
          router.use(this.initSecurity.bind(this));
        }

        for (let name in this.dynamicSchemas) {
          this.registerSchema(name, await this.dynamicSchemas[name].spec());
        }

        if (this.document.components && this.document.components.schemas && Object.keys(this.document.components.schemas).length > 0) {
          this.addResource(new SchemaResource());
        }

        // Move definitions into #/components/schemas/ as schemas
        this.document = rebaseOASDefinitions(this.document);
        // Remove unused schemas and parameters from openapi spec
        this.document = removeUnusedSchemas(this.document);

        const originalDocument = _.cloneDeep(this.document);

        router.get('/openapi.json', (req: APIRequest, res: APIResponse, next: NextFunction) => {
          if (!req.headers['host']) {
            next(API.newError(400, 'Bad Request', 'Missing Host header in the request'));
          } else {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET');
            const out: OpenAPIV3.Document = _.cloneDeep(originalDocument);
            const baseUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['host']}${req.baseUrl}`;
            out.servers = [
              {
                url: baseUrl,
              },
            ];

            // Normalize OAuth2 urls
            if (out.components && out.components.securitySchemes) {
              for (let i in out.components.securitySchemes) {
                const s = out.components.securitySchemes[i] as OpenAPIV3.OAuth2SecurityScheme;
                if (s.type === 'oauth2' && s.flows) {
                  for (let j in s.flows) {
                    const f = s.flows[j];
                    ['authorizationUrl', 'tokenUrl', 'refreshUrl'].forEach((k) => {
                      if (f[k]) {
                        f[k] = new URL(f[k], baseUrl).toString();
                      }
                    });
                  }
                }
              }
            }
            res.json(out);
          }
        });

        this.document = await parse(this.document, this.parseOptions);
        for (let resource of this.resources) {
          await resource.router(router, options);
        }
        router.use(this.handleError);
        return router;
      })();
    }
    return this.internalRouter;
  }

  async attach(base: Router, options?: RouterOptions): Promise<Router> {
    let router = await this.router(options);
    base.use('/v' + semver.major(this.document.info.version), router);
    return base;
  }
  initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction) {
    req.logger.warn('using default security validator');
    if (!req.scopes) {
      req.logger.warn('scopes not set, setting default to *');
      req.scopes = new Scopes('*');
    }
    next();
  }
  securityValidator(req: APIRequest, res: APIResponse, next: NextFunction) {
    this.initSecurity(req, res, next);
  }

  handleError(err: any, req: APIRequest, res: APIResponse, next?: NextFunction) {
    if (err.name === 'RESTError') {
      req.logger.error('REST ERROR', err);
      RESTError.send(res, err.code, err.message, err.info);
    } else if (err.name === 'ValidationError') {
      req.logger.error('DATA ERROR', err);
      RESTError.send(res, 400, err.name, ValidationError.getInfo(err));
    } else {
      req.logger.error('GENERIC ERROR', err, err.stack);
      RESTError.send(res, 500, 'internal');
    }
  }

  static newError(code: number, message?: string, info?: any, err?: any): RESTError {
    return new RESTError(code, message, info, err);
  }
  static fireError(code: number, message?: string, info?: any, err?: any): never {
    throw API.newError(code, message, info, err);
  }
  static handle404Error(req: APIRequest, res: APIResponse, next: NextFunction) {
    req.logger.warn('404 Resource Not Found');
    RESTError.send(res, 404, 'Not Found', 'the requested resource cannot be found, check the endpoint URL');
  }
}
