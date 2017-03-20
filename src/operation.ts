import * as _ from 'lodash';
import { Router, RouterOptions, NextFunction } from 'express';
import * as jp from 'jsonpolice';
import { json as jsonParser } from 'body-parser';
import { Swagger } from './swagger';
import { Scopes } from './scopes';
import { API, APIRequest, APIResponse, APIRequestHandler } from './api';
import { Resource } from './resource';

const swaggerPathRegExp = /\/:([^#\?\/]*)/g;
const __api = Symbol();
const __resource = Symbol();
const __path = Symbol();
const __method = Symbol();
const __scopes = Symbol();

export type Method = "get" | "put" | "post" | "delete" | "options" | "head" | "patch";

export abstract class Operation implements Swagger.Operation {
  operationId: string;
  summary?: string;
  description?: string;
  externalDocs?: Swagger.ExternalDocs;
  consumes?: string[];
  produces?: string[];
  parameters?: Swagger.Parameters;
  responses: Swagger.Responses;
  schemes?: Swagger.Scheme[];
  deprecated?: boolean;
  security?: Swagger.Security[];

  constructor(id: string, resource: Resource, path: string, method: Method) {
    this[__resource] = resource;
    this[__path] = path;
    this[__method] = method;
    this.setInfo(this.getDefaultInfo(id));
  }

  get api():API {
    return this[__api];
  }
  get resource():Resource {
    return this[__resource];
  }
  get path():string {
    return this[__path];
  }
  get swaggerPath(): string {
    return this.path.replace(swaggerPathRegExp, "/{$1}");
  }
  get method():Method {
    return this[__method];
  }
  get swaggerScopes(): Swagger.Scopes {
    return {
      [this.operationId]: this.summary || `Execute ${this.operationId} on a ${this.resource.name}`
    };
  }
  get scopes(): Scopes {
    return this[__scopes];
  }

  protected getDefaultInfo(id: string): Swagger.Operation {
    return {
      "operationId": `${this.resource.name}.${id}`,
      "tags": [ '' + this.resource.name ],
      "responses": {
        "default": {
          "$ref": "#/responses/defaultError"
        }
      }
    };
  }
  protected setInfo(info: Swagger.Operation): this {
    Object.assign(this, info);
    return this;
  }
  protected createValidators(key: string, parameters: Swagger.Parameter[]): Promise<APIRequestHandler> {
    return new Promise(resolve => {
      let validators: Promise<(req: APIRequest) => void>[] = [];
      parameters.forEach((parameter: Swagger.Parameter) => {
        let required = parameter.required;
        delete parameter.required;
        validators.push(this.api.registry.create(parameter).then((schema: jp.Schema) => {
          return function (req: APIRequest) {
            req.logger.debug(`validator ${key}.${parameter.name}`);
            if (typeof req[key][parameter.name] === 'undefined' && required === true) {
              throw new jp.ValidationError(key + '.' + parameter.name, (schema as any).scope, 'required');
            } else {
              let out = schema.validate(req[key][parameter.name], key + '.' + parameter.name);
              if (typeof out !== 'undefined') {
                req[key][parameter.name] = out;
              } else {
                delete req[key][parameter.name];
              }
            }
          }
        }));
      });
      resolve(Promise.all(validators).then((validators:((req: APIRequest) => void)[]) => {
        return function(req:APIRequest, res:APIResponse, next:NextFunction) {
          req.logger.debug('validating');
          validators.forEach(v => v(req));
          req.logger.debug('validated');
          next();
        }
      }));
    });
  }

  attach(api:API) {
    this[__api] = api;
    api.registerOperation(this.resource.basePath + this.swaggerPath, this.method, this);

    let swaggerScopes = this.swaggerScopes;
    let scopeNames:string[] = [];

    for (let i in swaggerScopes) {
      scopeNames.push(i);
      api.registerOauth2Scope(i, swaggerScopes[i]);
    }

    if (api.securityDefinitions && scopeNames.length) {
      for (let i in api.securityDefinitions) {
        if (api.securityDefinitions[i].type === 'oauth2') {
          if (!this.security) {
            this.security = [];
          }
          this.security.push({
            [i]: scopeNames
          });
        }
      }
    }
    if (scopeNames.length) {
      this[__scopes] = new Scopes(scopeNames);
    }
  }
  router(router:Router): Promise<Router> {
    return new Promise(resolve => {
      let middlewares:Promise<APIRequestHandler>[] = [];
      if (this.scopes) {
        middlewares.push(Promise.resolve((req: APIRequest, res: APIResponse, next: NextFunction) => {
          req.logger.debug(`checking scope, required: ${this.scopes}`);
          if (!req.scopes) {
            req.logger.warn('no scope');
            next(API.newError(401, 'no scope'));
          } else if (!req.scopes.match(this.scopes)) {
            req.logger.warn('insufficient scope', req.scopes);
            next(API.newError(403, 'insufficient privileges'));
          } else {
            req.logger.debug('scope ok');
            next();
          }
        }));
      }
      let params = _.groupBy(this.parameters || [], 'in') as {
        header: Swagger.HeaderParameter[];
        path: Swagger.PathParameter[];
        query: Swagger.QueryParameter[];
        body: Swagger.BodyParameter[];
      };
      if (params.header) {
        middlewares.push(this.createValidators('headers', params.header));
      }
      if (params.path) {
        _.each(params.path, function (i) {
          i.required = true;
        });
        middlewares.push(this.createValidators('params', params.path));
      }
      if (params.query) {
        middlewares.push(this.createValidators('query', params.query));
      }
      if (params.body) {
        middlewares.push(Promise.resolve(jsonParser()));
        middlewares.push(this.api.registry.create(params.body[0].schema).then((schema:jp.Schema) => {
          return (req:APIRequest, res:APIResponse, next:NextFunction) => {
            if (_.isEqual(req.body, {}) && (!parseInt(req.headers['content-length']))) {
              if (params.body[0].required === true) {
                throw new jp.ValidationError('body', schema.scope, 'required');
              }
            } else {
              schema.validate(req.body, 'body');
            }
            next();
          }
        }));
      }
      resolve(Promise.all(middlewares).then((middlewares:APIRequestHandler[]) => {
        router[this.method](this.path, ...middlewares, this.handler.bind(this));
        return router;
      }));
    });
  }

  abstract handler(req: APIRequest, res: APIResponse, next?: NextFunction);
}

export class SimpleOperation extends Operation {
  constructor(resource: Resource, path: string, method: Method, handler: APIRequestHandler) {
    super(`${path}.${method}`, resource, path, method);
    this.handler = handler;
  }
  handler(req: APIRequest, res: APIResponse, next?: NextFunction) {
    throw new Error('SimpleOperation handler not defined');
  }
}