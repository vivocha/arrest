import { Ability, AnyMongoAbility } from '@casl/ability';
import { permittedFieldsOf } from '@casl/ability/extra';
import { Scopes } from '@vivocha/scopes';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { Eredita } from 'eredita';
import { NextFunction, RequestHandler, Router } from 'express';
import _ from 'lodash';
import { OpenAPIV3, ParameterObject, Schema, SchemaObject, StaticSchemaObject, ValidationError } from 'openapi-police';
import { API } from './api.js';
import { Resource } from './resource.js';
import { APIRequest, APIRequestHandler, APIResponse, Method } from './types.js';
import { checkAbility } from './util.js';

const swaggerPathRegExp = /\/:([^#\?\/]*)/g;

export abstract class Operation {
  info: OpenAPIV3.OperationObject;
  api: API;
  internalId: string;
  scopes: Scopes;

  constructor(public resource: Resource, public path: string, public method: Method, id?: string, opts?: any) {
    if (!id) {
      id = path;
      if (id.length && id[0] === '/') {
        id = id.substr(1);
      }
      if (!id.length) {
        id = method;
      } else if (method !== 'get') {
        id += '-' + method;
      }
    }
    this.internalId = id;
    this.info = this.getInfo(opts);
    if (!this.info || !this.info.operationId) {
      throw new Error('Required operationId missing');
    }
  }

  get swaggerPath(): string {
    return this.path.replace(swaggerPathRegExp, '/{$1}');
  }
  get swaggerScopes(): OpenAPIV3.OAuth2SecurityScopes {
    return {
      [this.info.operationId as string]: this.info.summary || `Execute ${this.info.operationId} on a ${this.resource.info.name}`,
    };
  }

  protected getInfo(opts?: any): OpenAPIV3.OperationObject {
    return Eredita.deepExtend({}, this.getDefaultInfo(opts), this.getCustomInfo(opts));
  }
  protected getDefaultInfo(opts?: any): OpenAPIV3.OperationObject {
    return {
      operationId: `${this.resource.info.name}.${this.internalId}`,
      tags: ['' + this.resource.info.name],
      responses: {
        default: {
          $ref: '#/components/responses/defaultError',
        },
      },
    };
  }
  protected getCustomInfo(opts?: any): OpenAPIV3.OperationObject {
    return {};
  }
  protected createParameterValidators(key: string, parameters: OpenAPIV3.ParameterObject[]): APIRequestHandler {
    let validators: ((req: APIRequest) => Promise<void>)[] = parameters.map((parameter: OpenAPIV3.ParameterObject) => {
      let required = parameter.required || false;
      let hasDefault = typeof parameter.schema === 'object' && typeof (parameter.schema as any).default !== 'undefined';
      let schema: ParameterObject = new ParameterObject(parameter);

      return async function (req: APIRequest) {
        req.logger.debug(`validator ${key}.${parameter.name}, required ${required}, value ${req[key][parameter.name]}`);
        if (typeof req[key][parameter.name] === 'undefined' && required === true) {
          throw new ValidationError(`${key}.${parameter.name}`, (schema as any).scope, 'required');
        } else if (typeof req[key][parameter.name] !== 'undefined' || hasDefault) {
          req[key][parameter.name] = await schema.validate(req[key][parameter.name], { setDefault: true }, `${key}.${parameter.name}`);
        }
      };
    });

    return async function (req: APIRequest, res: APIResponse, next: NextFunction) {
      try {
        for (let v of validators) {
          await v(req);
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  }
  protected createJSONParser(): RequestHandler {
    return bodyParser.json() as RequestHandler;
  }
  protected createUrlencodedParser(): RequestHandler {
    return bodyParser.urlencoded({ extended: true }) as RequestHandler;
  }
  protected createBodyValidators(): undefined | APIRequestHandler[] {
    if (this.info.requestBody) {
      const body: OpenAPIV3.RequestBodyObject = this.info.requestBody as OpenAPIV3.RequestBodyObject;
      if (!body.content) {
        throw new Error('Invalid request body'); // TODO maybe use another error type
      }
      if (body.content['application/json']) {
        return [this.createJSONParser(), this.createBodyValidator('application/json', body.content['application/json'], body.required)];
      }
      if (body.content['application/x-www-form-urlencoded']) {
        return [
          this.createUrlencodedParser(),
          this.createBodyValidator('application/x-www-form-urlencoded', body.content['application/x-www-form-urlencoded'], body.required),
        ];
      }
    } else if (['put', 'post', 'patch'].includes(this.method)) {
      return [this.createJSONParser()];
    }
  }
  protected createBodyValidator(type: string, bodySpec: OpenAPIV3.MediaTypeObject, required: boolean = false): APIRequestHandler {
    if (!bodySpec.schema) {
      throw new Error(`Schema missing for content type ${type}`);
    }
    const schema = new StaticSchemaObject(bodySpec.schema as OpenAPIV3.SchemaObject);
    return async (req: APIRequest, res: APIResponse, next: NextFunction) => {
      if (_.isEqual(req.body, {}) && !parseInt('' + req.header('content-length'))) {
        if (required === true) {
          next(new ValidationError('body', Schema.scope(schema), 'required'));
        } else {
          next();
        }
      } else {
        try {
          req.body = await schema.validate(
            req.body,
            {
              setDefault: true,
              coerceTypes: type !== 'application/json',
              context: 'write',
            },
            'body'
          );
        } catch (err) {
          next(err);
          return;
        }
        next();
      }
    };
  }
  protected useSecurityValidator(): boolean {
    return !!this.scopes;
  }
  protected securityValidator(req: APIRequest, res: APIResponse, next: NextFunction) {
    req.logger.debug(`checking ability/scope, required: ${this.scopes}`);
    if (req.ability) {
      try {
        this.checkAbility(req.ability);
      } catch (err) {
        req.logger.warn(`insufficient ability`, err);
        req.logger.debug('insufficient privileges required', this.scopes, 'for user perms', req['perms']);
        next(API.newError(403, 'insufficient privileges'));
      }
      req.logger.debug('ability ok');
      next();
    } else if (req.scopes) {
      if (!req.scopes.match(this.scopes)) {
        req.logger.warn('insufficient scope', req.scopes);
        req.logger.debug('insufficient privileges required', this.scopes, 'for user perms', req.scopes);
        next(API.newError(403, 'insufficient privileges'));
      } else {
        req.logger.debug('scope ok');
        next();
      }
    } else {
      req.logger.warn('no scope');
      next(API.newError(401, 'no scope'));
    }
  }
  protected errorHandler(err: any, req: APIRequest, res: APIResponse, next: NextFunction) {
    next(err);
  }

  attach(api: API) {
    this.api = api;

    const infoGetter = api.registerOperation(this.resource.basePath + this.swaggerPath, this.method, this.info);
    Object.defineProperty(this, 'info', {
      get: infoGetter,
    });

    let swaggerScopes = this.swaggerScopes;
    let scopeNames: string[] = [];

    for (let i in swaggerScopes) {
      scopeNames.push(i);
      api.registerOauth2Scope(i, swaggerScopes[i]);
    }
    if (this.api.document.components && this.api.document.components.securitySchemes) {
      const schemes = this.api.document.components.securitySchemes;
      for (let k in schemes) {
        if (!this.info.security) {
          this.info.security = [];
        }
        const s = schemes[k] as OpenAPIV3.OAuth2SecurityScheme;
        this.info.security.push({
          [k]: s.type === 'oauth2' ? scopeNames : [],
        });
      }
    }
    if (scopeNames.length) {
      this.scopes = new Scopes(scopeNames);
    }
  }
  async router(router: Router): Promise<Router> {
    const middlewares: APIRequestHandler[] = [];
    if (this.useSecurityValidator()) {
      middlewares.push(this.securityValidator.bind(this));
    }
    let params = _.groupBy(this.info.parameters || [], 'in') as unknown as {
      path: OpenAPIV3.ParameterObject[];
      query: OpenAPIV3.ParameterObject[];
      header: OpenAPIV3.ParameterObject[];
      cookie: OpenAPIV3.ParameterObject[];
    };
    if (params.header) {
      middlewares.push(this.createParameterValidators('headers', params.header));
    }
    if (params.cookie) {
      middlewares.push(cookieParser());
      middlewares.push(this.createParameterValidators('cookies', params.cookie));
    }
    if (params.path) {
      _.each(params.path, function (i) {
        i.required = true;
      });
      middlewares.push(this.createParameterValidators('params', params.path));
    }
    if (params.query) {
      middlewares.push(this.createParameterValidators('query', params.query));
    }
    const bodyMiddlewares = this.createBodyValidators();
    if (bodyMiddlewares) {
      middlewares.push(...bodyMiddlewares);
    }

    router[this.method](this.path, ...middlewares, this.handler.bind(this), this.errorHandler.bind(this));
    return router;
  }

  abstract handler(req: APIRequest, res: APIResponse, next?: NextFunction);

  checkAbility(ability: Ability, data?: any, filterFields?: boolean, filterData?: boolean): any {
    if (this.scopes) {
      for (let resource in this.scopes) {
        for (let action in this.scopes[resource]) {
          data = checkAbility(ability, resource, action, data, filterFields, filterData);
        }
      }
    }
    return data;
  }
  checkAbilityForPath(ability: Ability, path: string): boolean {
    if (this.scopes) {
      for (let resource in this.scopes) {
        for (let action in this.scopes[resource]) {
          if (ability.can(action, resource, path)) {
            return true;
          }
        }
      }
      return false;
    } else {
      return true;
    }
  }
  filterFields(ability: Ability, data: any): any {
    return this.checkAbility(ability, data, true);
  }
  permittedFields(ability: AnyMongoAbility): Set<string> {
    let out: string[] = [];
    if (this.scopes) {
      for (let resource in this.scopes) {
        for (let action in this.scopes[resource]) {
          out = out.concat(
            permittedFieldsOf(ability, action, resource, {
              fieldsFrom: (rule) => rule.fields || ['**'],
            })
          );
        }
      }
    }
    return new Set(out);
  }
}

export class SimpleOperation extends Operation {
  constructor(protected customHandler: APIRequestHandler, resource: Resource, path: string, method: Method, id?: string) {
    super(resource, path, method, id);
  }
  handler(req: APIRequest, res: APIResponse, next?: NextFunction) {
    this.customHandler(req, res, next);
  }
}
