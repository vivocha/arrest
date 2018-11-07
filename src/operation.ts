import { json as jsonParser } from 'body-parser';
import { NextFunction, Router } from 'express';
import * as jp from 'jsonpolice';
import * as _ from 'lodash';
import { API, APIRequest, APIRequestHandler, APIResponse } from './api';
import { Resource } from './resource';
import { Scopes } from './scopes';
import { Swagger } from './swagger';

const swaggerPathRegExp = /\/:([^#\?\/]*)/g;
const __api = Symbol();
const __resource = Symbol();
const __id = Symbol();
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

  protected [__api]: API;
  protected [__resource]: Resource;
  protected [__id]: string;
  protected [__path]: string;
  protected [__method]: Method;
  protected [__scopes]: Scopes;

  constructor(resource: Resource, path: string, method: Method, id?: string) {
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
    this[__resource] = resource;
    this[__id] = id;
    this[__path] = path;
    this[__method] = method;
    this.setInfo(this.getDefaultInfo());
  }

  get api(): API {
    return this[__api];
  }
  get resource(): Resource {
    return this[__resource];
  }
  get opId(): string {
    return this[__id];
  }
  get path(): string {
    return this[__path];
  }
  get swaggerPath(): string {
    return this.path.replace(swaggerPathRegExp, "/{$1}");
  }
  get method(): Method {
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

  protected getDefaultInfo(): Swagger.Operation {
    return {
      "operationId": `${this.resource.name}.${this.opId}`,
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
  protected async createValidators(key: string, parameters: Swagger.Parameter[]): Promise<APIRequestHandler> {
    let validatorFactories: Promise<(req: APIRequest) => Promise<void>>[] = parameters.map(async (parameter: Swagger.Parameter) => {
      let required = parameter.required;
      delete parameter.required;
      let schema:jp.Schema = await this.api.registry.create(parameter);

      return async function(req: APIRequest) {
        req.logger.debug(`validator ${key}.${parameter.name}, required ${required}, value ${req[key][parameter.name]}`);
        if (typeof req[key][parameter.name] === 'undefined') {
          if (required === true) {
            throw new jp.ValidationError(key + '.' + parameter.name, (schema as any).scope, 'required');
          }
        } else {
          req[key][parameter.name] = await schema.validate(req[key][parameter.name], key + '.' + parameter.name);
        }
      }
    });

    let validators:((req: APIRequest) => Promise<void>)[] = await Promise.all(validatorFactories);

    return async function(req:APIRequest, res:APIResponse, next:NextFunction) {
      try {
        for (let v of validators) {
          await v(req);
        }
        next();
      } catch(err) {
        next(err);
      }
    }
  }
  protected useSecurityValidator(): boolean {
    return !!this.scopes;
  }
  protected async securityValidator(req: APIRequest, res: APIResponse): Promise<boolean> {
    req.logger.debug(`checking scope, required: ${this.scopes}`);
    if (!req.scopes) {
      req.logger.warn('no scope');
      throw API.newError(401, 'no scope');
    } else if (!req.scopes.match(this.scopes)) {
      req.logger.warn('insufficient scope', req.scopes);
      throw API.newError(403, 'insufficient privileges');
    } else {
      req.logger.debug('scope ok');
      return true;
    }
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
  async router(router:Router): Promise<Router> {
    let promises:Promise<APIRequestHandler>[] = [];
    if (this.useSecurityValidator()) {
      promises.push(Promise.resolve(async (req: APIRequest, res: APIResponse, next: NextFunction) => {
        try {
          await this.securityValidator(req, res);
          next();
        } catch(err) {
          next(err);
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
      promises.push(this.createValidators('headers', params.header));
    }
    if (params.path) {
      _.each(params.path, function (i) {
        i.required = true;
      });
      promises.push(this.createValidators('params', params.path));
    }
    if (params.query) {
      promises.push(this.createValidators('query', params.query));
    }
    if (params.body) {
      promises.push(Promise.resolve(jsonParser()));
      promises.push(this.api.registry.create(params.body[0].schema).then((schema:jp.Schema) => {
        return (req:APIRequest, res:APIResponse, next:NextFunction) => {
          if (_.isEqual(req.body, {}) && (!parseInt('' + req.header('content-length')))) {
            if (params.body[0].required === true) {
              next(new jp.ValidationError('body', schema.scope, 'required'));
            } else {
              next();
            }
          } else {
            schema.validate(req.body, 'body').then(() => next(), err => next(err));
          }
        }
      }));
    }
    let middlewares:APIRequestHandler[] = await Promise.all(promises);
    router[this.method](this.path, ...middlewares, this.handler.bind(this));
    return router;
  }

  abstract handler(req: APIRequest, res: APIResponse, next?: NextFunction);
}

export class SimpleOperation extends Operation {
  constructor(handler: APIRequestHandler, resource: Resource, path: string, method: Method, id?: string) {
    super(resource, path, method, id);
    this.handler = handler;
  }
  handler(req: APIRequest, res: APIResponse, next?: NextFunction) {
    throw new Error('SimpleOperation handler not defined');
  }
}