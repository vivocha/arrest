import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as _ from 'lodash';
import * as semver from 'semver';
import * as express from 'express';
import { normalizeUri } from 'jsonref';
import { Schema, DynamicSchema } from 'jsonpolice';
import { Router, RouterOptions, RequestHandler, Request, Response, NextFunction } from 'express';
import { Eredita } from 'eredita';
import { getLogger, Logger } from 'debuggo';
import { RESTError } from './error';
import { SchemaRegistry } from './schema';
import { Swagger } from './swagger';
import { Scopes } from './scopes';
import { Resource } from './resource';

const __logger = Symbol();
const __options = Symbol();
const __schemas = Symbol();
const __registry = Symbol();
const __resources = Symbol();
const __router = Symbol();
const __default_swagger = {
  swagger: '2.0',
  info: { version: '1.0.0' },
  schemes: [ "https", "http" ],
  consumes: [ "application/json" ],
  produces: [ "application/json" ],
  definitions: {
    "metadata": {
      "description": "Metadata associated with the resource",
      "type": "object"
    },
    "objectId": {
      "description": "Name of the property storing the unique identifier of the resource",
      "type": "string"
    },
    "errorResponse": {
      "type": "object",
      "properties": {
        "error": {
          "type": "integer",
          "minimum": 100
        },
        "message": {
          "type": "string"
        },
        "info": {
          "type": "string"
        }
      },
      "required": [ "error", "message" ]
    }
  },
  parameters: {
    "id": {
      "description": "Unique identifier of the resource",
      "name": "id",
      "in": "path",
      "type": "string",
      "required": true
    },
    "limit": {
      "name": "limit",
      "in": "query",
      "description": "Maximum number of items to return",
      "type": "integer",
      "default": 20,
      "minimum": 1,
      "maximum": 100
    },
    "skip": {
      "name": "skip",
      "in": "query",
      "description": "Skip the specified number of items",
      "type": "integer",
      "default": 0,
      "minimum": 0
    },
    "fields": {
      "name": "fields",
      "in": "query",
      "description": "Return only the specified properties",
      "type": "array",
      "items": {
        "type": "string"
      },
      "uniqueItems": true
    },
    "sort": {
      "name": "sort",
      "in": "query",
      "description": "Sorting criteria, using RQL syntax (a,-b,+c)",
      "type": "array",
      "items": {
        "type": "string"
      },
      "uniqueItems": true
    },
    "query": {
      "name": "q",
      "in": "query",
      "description": "Return only items matching the specified [RQL](https://github.com/persvr/rql) query. This parameter can also be used to specify the ordering criteria of the results",
      "type": "string"
    }
  },
  responses: {
    "defaultError": {
      "description": "Default/generic error response",
      "schema": { "$ref": "#/definitions/errorResponse" }
    },
    "notFound": {
      "description": "The requested/specified resource was not found",
      "schema": { "$ref": "#/definitions/errorResponse" }
    }
  }
};
const __default_schema_operation: Swagger.Operation = {
  "summary": "Retrieve a Schema by id",
  "operationId": "Schema.read",
  "parameters": [
    {
      "$ref": "#/parameters/id"
    }
  ],
  "responses": {
    "200": {
      "description": "The requested Schema",
      "schema": {
        "$ref": "http://json-schema.org/draft-04/schema#"
      }
    },
    "404": {
      "$ref": "#/responses/notFound"
    },
    "default": {
      "$ref": "#/responses/defaultError"
    }
  },
  "tags": [
    "Schema"
  ]
};
const __default_schema_tag: Swagger.Tag = {
  "name": "Schema",
  "description": "JSON-Schema definitions used by this API",
  "x-name-plural": "Schemas"
};
const __default_options: APIOptions = {
  swagger: true
};

let reqId: number = 0;

export interface APIRequest extends Request {
  scopes: Scopes;
  logger: Logger;
}
export interface APIResponse extends Response {
  logger: Logger;
}
export interface APIRequestHandler extends RequestHandler {
  (req: APIRequest, res: APIResponse, next: NextFunction): any;
}

export interface APIOptions {
  swagger?: boolean;
  registry?: SchemaRegistry;
}

export class API implements Swagger {
  swagger;
  info;
  paths;
  host?: string;
  basePath?: string;
  schemes?: Swagger.Scheme[];
  consumes?: string[];
  produces?: string[];
  definitions?: Swagger.Definitions;
  parameters?: Swagger.ParameterDefinitionObject;
  responses?: Swagger.Responses;
  security?: Swagger.Security[];
  securityDefinitions?: Swagger.SecurityDefinitions;
  tags?: Swagger.Tag[];
  externalDocs?: Swagger.ExternalDocs;

  constructor(info?:Swagger, options?:APIOptions) {
    this[__logger] = getLogger(this.getDebugLabel());
    Object.assign(this, (new Eredita(info || {}, new Eredita(_.cloneDeep(__default_swagger)))).mergePath());
    delete this.paths;
    delete this.tags;
    if (!semver.valid(this.info.version)) {
      throw new Error('invalid_version');
    }
    this[__options] = Object.assign({}, (new Eredita(options || {}, new Eredita(_.cloneDeep(__default_options)))).mergePath());
    this[__schemas] = null;
    this[__registry] = this.options.registry || new SchemaRegistry();
    this[__resources] = [];
  }

  get registry():SchemaRegistry {
    return this[__registry];
  }
  get resources():Resource[] {
    return this[__resources];
  }

  get logger(): Logger {
    return this[__logger];
  }
  get options(): APIOptions {
    return this[__options];
  }

  protected getDebugLabel(): string {
    return 'arrest';
  }
  protected getDebugContext(): string {
    return `#${++reqId}`;
  }

  addResource(resource:Resource): this {
    this.resources.push(resource);
    resource.attach(this);
    return this;
  }

  registerSchema(id: string, schema: Swagger.Schema | DynamicSchema) {
    if (!this[__schemas]) {
      this[__schemas] = {};
      this.registerTag(_.cloneDeep(__default_schema_tag));
      this.registerOperation('/schemas/{id}', 'get', _.cloneDeep(__default_schema_operation));
    }

    let _schema: Swagger.FullSchema;
    if (schema && typeof (<any>schema).validate === 'function') {
      _schema = {};
      Schema.attach(_schema, schema as DynamicSchema);
    } else {
      _schema = schema as Swagger.FullSchema;
    }

    this[__schemas][id] = _schema;
    this.registry.register(`schemas/${id}`, _schema);
  }
  registerOperation(path:string, method:string, operation:Swagger.Operation) {
    if (!this.paths) {
      this.paths = {};
    }
    let _path = path;
    if (_path.length > 1 && _path[_path.length - 1] === '/') {
      _path = _path.substr(0, _path.length - 1);
    }
    if (!this.paths[_path]) {
      this.paths[_path] = {};
    }
    this.paths[_path][method] = operation;
  }
  registerTag(tag:Swagger.Tag) {
    if (!this.tags) {
      this.tags = [];
    }
    this.tags.push(tag);
  }
  registerOauth2Scope(name:string, description:string): void {
    if (this.securityDefinitions) {
      _.each(_.filter(this.securityDefinitions, { type: 'oauth2' }), (i:Swagger.SecurityOAuth2) => {
        if (!i.scopes) {
          i.scopes = {};
        }
        i.scopes[name] = description;
      });
    }
  }

  async listen(httpPort: number, httpsPort?: number, httpsOptions?: https.ServerOptions): Promise<any> {
    if (!httpPort && !httpsPort) {
      throw new Error('no listen ports specified');
    } else if (httpPort && !httpsPort) {
      this.schemes = [ 'http' ];
    } else if (!httpPort && httpsPort) {
      this.schemes = [ 'https' ];
    }
    let router = await this.router();
    let app = express();
    app.use(router);
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

  async router(options?: RouterOptions): Promise<Router> {
    if (!this[__router]) {
      this.logger.info('creating router');
      let r = Router(options);
      r.use((_req: Request, res: Response, next: NextFunction) => {
        let req: APIRequest = _req as APIRequest;
        if (!req.logger) {
          req.logger = getLogger(this.getDebugLabel(), this.getDebugContext());
        }
        next();
      });
      r.use(this.securityValidator.bind(this));
      if (this.options.swagger) {
        let originalSwagger:Swagger = _.cloneDeep(this) as Swagger;
        r.get('/swagger.json', (req: APIRequest, res: APIResponse, next: NextFunction) => {
          let out:any = _.cloneDeep(originalSwagger);
          if (!req.headers['host']) {
            next(API.newError(400, 'Bad Request', 'Missing Host header in the request'));
          } else {
            out.host = req.headers['host'];
            out.basePath = req.baseUrl || '/';
            if (!out.basePath.endsWith('/')) {
              out.basePath += '/';
            }
            let proto = this.schemes && this.schemes.length ? this.schemes[0] : 'http';
            let id = url.resolve(proto + '://' + out.host + out.basePath, 'swagger.json#');
            if (originalSwagger.securityDefinitions) {
              _.each(originalSwagger.securityDefinitions, (i:any, k) => {
                if (k) {
                  if (i.authorizationUrl) {
                    out.securityDefinitions[k].authorizationUrl = normalizeUri(i.authorizationUrl, id, true);
                  }
                  if (i.tokenUrl) {
                    out.securityDefinitions[k].tokenUrl = normalizeUri(i.tokenUrl, id, true);
                  }
                }
              });
            }
            res.json(out);
          }
        });
      }
      if (this[__schemas]) {
        r.get('/schemas/:id', (req: APIRequest, res: APIResponse, next: NextFunction) => {
          let s = this[__schemas][req.params.id];
          if (s) {
            Schema.get(s).schema().then(data => res.json(data));
          } else {
            next();
          }
        });
      }
      for (let i in this[__schemas]) {
        await this.registry.create(this[__schemas][i]);
      }
      await this.registry.resolve(this)
      let promises: Promise<Router>[] = [];
      this.resources.forEach((resource: Resource) => {
        promises.push(resource.router(r, options));
      });
      await Promise.all(promises);
      r.use(API.handleError);
      this[__router] = Promise.resolve(r);
    }
    return this[__router];
  }
  async attach(base:Router, options?: RouterOptions): Promise<Router> {
    let router = await this.router(options)
    base.use('/v' + semver.major(this.info.version), router);
    return base;
  }
  securityValidator(req:APIRequest, res:APIResponse, next:NextFunction) {
    req.logger.warn('using default security validator');
    if (!req.scopes) {
      req.logger.warn('scopes not set, setting default to *');
      req.scopes = new Scopes('*');
    }
    next();
  }

  static newError(code: number, message?: string, info?: any, err?: any): RESTError {
    return new RESTError(code, message, info, err);
  }
  static fireError(code: number, message?: string, info?: any, err?: any): never {
    throw API.newError(code, message, info, err);
  }
  static handleError(err: any, req: APIRequest, res: APIResponse, next?: NextFunction) {
    if (err.name === 'RESTError') {
      req.logger.error('REST ERROR', err);
      RESTError.send(res, err.code, err.message, err.info);
    } else if (err.name === 'ValidationError') {
      req.logger.error('DATA ERROR', err);
      RESTError.send(res, 400, err.message, err.path);    
    } else {
      req.logger.error('GENERIC ERROR', err, err.stack);
      RESTError.send(res, 500, 'internal');
    }    
  }
}
