import { json as jsonParser, urlencoded as urlencodedParser } from 'body-parser';
import { Eredita } from 'eredita';
import { NextFunction, Router } from 'express';
import * as jp from 'jsonpolice';
import * as _ from 'lodash';
import { OpenAPIV3, ParameterObject, StaticSchemaObject } from 'openapi-police';
import { API } from './api';
import { Resource } from './resource';
import { Scopes } from './scopes';
import { APIRequest, APIRequestHandler, APIResponse, Method } from './types';
import cookieParser = require('cookie-parser');

const swaggerPathRegExp = /\/:([^#\?\/]*)/g;


export abstract class Operation {
  info: OpenAPIV3.OperationObject;
  api: API;
  internalId: string;
  scopes: Scopes;

  constructor(public resource: Resource, public path: string, public method: Method, id?: string) {
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
    this.info = this.getInfo();
    if (!this.info || !this.info.operationId) {
      throw new Error('Required operationId missing');
    }
  }

  get swaggerPath(): string {
    return this.path.replace(swaggerPathRegExp, "/{$1}");
  }
  get swaggerScopes(): OpenAPIV3.OAuth2SecurityScopes {
    return {
      [this.info.operationId as string]: this.info.summary || `Execute ${this.info.operationId} on a ${this.resource.info.name}`
    };
  }

  protected getInfo(): OpenAPIV3.OperationObject {
    return Eredita.deepExtend({}, this.getDefaultInfo(), this.getCustomInfo());
  }
  protected getDefaultInfo(): OpenAPIV3.OperationObject {
    return {
      "operationId": `${this.resource.info.name}.${this.internalId}`,
      "tags": [ '' + this.resource.info.name ],
      "responses": {
        "default": {
          "$ref": "#/components/responses/defaultError"
        }
      }
    };
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {};
  }
  protected createParameterValidators(key: string, parameters: OpenAPIV3.ParameterObject[]): APIRequestHandler {
    let validators: ((req: APIRequest) => Promise<void>)[] = parameters.map((parameter: OpenAPIV3.ParameterObject) => {
      let required = parameter.required || false;
      let schema: ParameterObject = new ParameterObject(parameter);

      return async function(req: APIRequest) {
        req.logger.debug(`validator ${key}.${parameter.name}, required ${required}, value ${req[key][parameter.name]}`);
        if (typeof req[key][parameter.name] === 'undefined') {
          if (required === true) {
            throw new jp.ValidationError(`${key}.${parameter.name}`, (schema as any).scope, 'required');
          }
        } else {
          req[key][parameter.name] = await schema.validate(req[key][parameter.name], { setDefault: true }, `${key}.${parameter.name}`);
        }
      }
    });

    return async function(req: APIRequest, res: APIResponse, next: NextFunction) {
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
  protected createBodyValidator(type: string, bodySpec: OpenAPIV3.MediaTypeObject, required: boolean = false): APIRequestHandler {
    if (!bodySpec.schema) {
      throw new Error(`Schema missing for content type ${type}`);
    }
    const schema = new StaticSchemaObject(bodySpec.schema as OpenAPIV3.SchemaObject);
    return async (req:APIRequest, res:APIResponse, next:NextFunction) => {
      if (_.isEqual(req.body, {}) && (!parseInt('' + req.header('content-length')))) {
        if (required === true) {
          next(new jp.ValidationError('body', jp.Schema.scope(schema), 'required'));
        } else {
          next();
        }
      } else {
        req.body = await schema.validate(req.body, {
          setDefault: true,
          coerceTypes: (type !== 'application/json')
        }, 'body').then(() => next(), err => next(err));
      }
    };

  }
  protected useSecurityValidator(): boolean {
    return !!this.scopes;
  }
  protected securityValidator(req: APIRequest, res: APIResponse, next: NextFunction) {
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
  }

  attach(api:API) {
    this.api = api;
    api.registerOperation(this.resource.basePath + this.swaggerPath, this.method, this.info);

    let swaggerScopes = this.swaggerScopes;
    let scopeNames:string[] = [];

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
          [k]: s.type === 'oauth2' ? scopeNames : []
        });
      }
    }
    if (scopeNames.length) {
      this.scopes = new Scopes(scopeNames);
    }
  }
  async router(router:Router): Promise<Router> {
    const middlewares:APIRequestHandler[] = [];
    if (this.useSecurityValidator()) {
      middlewares.push(this.securityValidator.bind(this));
    }
    let params = _.groupBy(this.info.parameters || [], 'in') as {
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
    if (this.info.requestBody) {
      const body: OpenAPIV3.RequestBodyObject = this.info.requestBody as OpenAPIV3.RequestBodyObject;
      if (!body.content) {
        throw new Error('Invalid request body'); // TODO maybe use another error type
      }
      if (body.content['application/json']) {
        middlewares.push(jsonParser());
        middlewares.push(this.createBodyValidator('application/json', body.content['application/json'], body.required));
      }
      if (body.content['application/x-www-form-urlencoded']) {
        middlewares.push(urlencodedParser({ extended: true }));
        middlewares.push(this.createBodyValidator('application/x-www-form-urlencoded', body.content['application/x-www-form-urlencoded'], body.required));
      }
    } else if ([ 'put', 'post', 'patch'].includes(this.method)) {
      middlewares.push(jsonParser());
    }

    router[this.method](this.path, ...middlewares, this.handler.bind(this));
    return router;
  }

  abstract handler(req: APIRequest, res: APIResponse, next?: NextFunction);
}

export class SimpleOperation extends Operation {
  constructor(protected customHandler: APIRequestHandler, resource: Resource, path: string, method: Method, id?: string) {
    super(resource, path, method, id);
  }
  handler(req: APIRequest, res: APIResponse, next?: NextFunction) {
    this.customHandler(req, res, next);
  }
}