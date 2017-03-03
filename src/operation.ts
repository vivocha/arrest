import * as _ from 'lodash';
import { Router, RouterOptions, Request, Response, NextFunction, RequestHandler } from 'express';
import * as jp from 'jsonpolice';
import { json as jsonParser } from 'body-parser';
import { Swagger } from './swagger';
import { API } from './api';
import { Resource } from './resource';

const __api = Symbol();
const __resource = Symbol();
const __path = Symbol();
const __method = Symbol();

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

  constructor(info:Swagger.Operation, resource:Resource, path:string, method:Method) {
    Object.assign(this, info);
    this[__resource] = resource;
    this[__path] = path;
    this[__method] = method;
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
  get method():Method {
    return this[__method];
  }
  get scopes(): Swagger.Scopes {
    return {
      [this.operationId]: this.summary || `Execute ${this.operationId} on a ${this.resource.name}`
    };
  }

  // TODO added debug info into and out of the validators
  protected createValidators(key:string, parameters:Swagger.Parameter[]):Promise<RequestHandler> {
    return new Promise(resolve => {
      let validators: Promise<(req: Request) => void>[] = [];
      parameters.forEach((parameter: Swagger.Parameter) => {
        let required = parameter.required;
        delete parameter.required;
        validators.push(this.api.registry.create(parameter).then((schema: jp.Schema) => {
          return function (req: Request) {
            if (typeof req[key][parameter.name] === 'undefined' && required === true) {
              jp.fireValidationError(key + '.' + parameter.name, (schema as any).scope, 'required');
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
      resolve(Promise.all(validators).then((validators:((req: Request) => void)[]) => {
        return function(req:Request, res:Response, next:NextFunction) {
          validators.forEach(v => v(req));
          next();
        }
      }));
    });
  }

  attach(api:API) {
    this[__api] = api;
    if (!api.paths) api.paths = {};
    if (!api.paths[this.path]) api.paths[this.path] = {};
    api.paths[this.path][this.method] = this;

    let scopes = this.scopes;
    let scopeNames:string[] = [];

    for (let i in scopes) {
      scopeNames.push(i);
      api.addOauth2Scope(i, scopes[i]);
    }

    if (scopeNames.length) {
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
  }
  router(router:Router): Promise<Router> {
    return new Promise((resolve, reject) => {
      let middlewares:Promise<RequestHandler>[] = [];
      if (this.security && this.security.length) {
        // TODO add debug prints for the security validator
        middlewares.push(Promise.resolve(this.api.securityValidator(this.security)));
      }
      let params = _.groupBy(this.parameters, 'in') as {
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
          return (req:Request, res:Response, next:NextFunction) => {
            if (typeof req.body === 'undefined') {
              if (params.body[0].required === true) {
                // TODO maybe scope shouldn't be protected
                jp.fireValidationError('body', (schema as any).scope, 'required');
              }
            } else {
              schema.validate(req.body, 'body');
            }
            next();
          }
        }));
      }
      resolve(Promise.all(middlewares).then((middlewares:RequestHandler[]) => {
        router[this.method](this.path, ...middlewares, this.handler.bind(this));
        return router;
      }));
    });
  }

  abstract handler(req:Request, res:Response);
}