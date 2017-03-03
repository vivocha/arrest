import * as _ from 'lodash';
import * as semver from 'semver';
import * as jr from 'jsonref';
import { Router, RouterOptions, RequestHandler, Request, Response, NextFunction } from 'express';
import { Eredita } from 'eredita';
import Logger from './debug';
import { RESTError } from './error';
import { SchemaRegistry } from './schema';
import { Swagger } from './swagger';
import { Resource } from './resource';

const logger = Logger('arrest');
const __schemas = Symbol();
const __registry = Symbol();
const __resources = Symbol();
const __router = Symbol();
const _default = {
  paths: {
    "/schemas/{id}": {
      "get": {
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
      }
    }
  },
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
  },
  tags: [
    {
      "name": "Schema",
      "description": "JSON-Schema definitions used by this API",
      "x-name-plural": "Schemas"
    }
  ],
};

const toSwaggerPath = (function() {
  var _regexp = /\/:([^#\?\/]*)/g;
  return function (path) {
    return path.replace(_regexp, "/{$1}");
  }
})();

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
  parameters?: Swagger.Parameters;
  responses?: Swagger.Responses;
  security?: Swagger.Security[];
  securityDefinitions?: Swagger.SecurityDefinitions;
  tags?: Swagger.Tag[];
  externalDocs?: Swagger.ExternalDocs;

  constructor(info:Swagger, registry:SchemaRegistry) {
    delete info.paths;
    delete info.tags;
    Object.assign(this, (new Eredita(info, new Eredita(_default))).mergePath());
    if (!semver.valid(this.info.version)) {
      throw new Error('invalid_version');
    }
    this[__schemas] = {};
    this[__registry] = registry;
    this[__resources] = [];
  }
  get registry():SchemaRegistry {
    return this[__registry];
  }
  get resources():Resource[] {
    return this[__resources];
  }

  addResource(resource:Resource): this {
    this.resources.push(resource);
    resource.attach(this);
    return this;
  }

  router(options?: RouterOptions): Promise<Router> {
    if (!this[__router]) {
      this[__router] = new Promise(resolve => {
        let r = Router(options);
        let originalSwagger = JSON.parse(JSON.stringify(this));
        r.get('/swagger.json', (req: Request, res: Response) => {
          let out = _.cloneDeep(originalSwagger);
          out.host = req.headers['host'] || req.hostname;
          out.basePath = req.baseUrl || '/v' + semver.major(this.info.version);
          out.id = 'https://' + out.host + out.basePath + '/swagger.json#';
          _.each(originalSwagger.securityDefinitions, function (i, k) {
            if (i.authorizationUrl) {
              out.securityDefinitions[k].authorizationUrl = jr.normalizeUri(i.authorizationUrl, out.id, true);
            }
            if (i.tokenUrl) {
              out.securityDefinitions[k].tokenUrl = jr.normalizeUri(i.tokenUrl, out.id, true);
            }
          });
          res.json(out);
        });
        r.get('/schemas/:id', (req: Request, res: Response, next: NextFunction) => {
          if (this[__schemas][req.params.id]) {
            (this[__schemas][req.params.id] as RequestHandler)(req, res, next);
          } else {
            next();
          }
        });
        resolve(this.registry.resolve(this).then(() => {
          let promises: Promise<Router>[] = [];
          this.resources.forEach((resource: Resource) => {
            promises.push(resource.router(r, options));
          });
          return Promise.all(promises).then(() => {
            r.use(API.handleError);
            return r;
          });
        }));
      });
    }
    return this[__router];
  }
  attach(base:Router): Promise<Router> {
    return this.router().then(router => {
      base.use('/v' + semver.major(this.info.version), router);
      return base;
    });
  }
  securityValidator(security): RequestHandler {
    return function(req:Request, res:Response, next:NextFunction) {
      logger.warn('using default security validator');
      next();
    }
  }
  addOauth2Scope(name:string, description:string): void {
    _.each(_.filter(this.securityDefinitions, { type: 'oauth2' }), (i:Swagger.SecurityOAuth2) => {
      if (!i.scopes) {
        i.scopes = {};
      }
      i.scopes[name] = description;
    });
  }
  registerSchema(id:string, handler:RequestHandler): this {
    this[__schemas][id] = handler;
    return this;
  }

  static handleMethodNotAllowed(req: Request, res: Response, next: NextFunction){
    next(API.newError(405, 'Method Not Allowed', "The API Endpoint doesn't support the specified HTTP method for the given resource", new Error('MethodNotAllowed')));
  }
  static newError(code: number, message: string, info: any, err: any) {
    return new RESTError(code, message, info, err);
  }
  static fireError(code: number, message?: string, info?: any, err?: any) {
    throw new RESTError(code, message, info, err);
  }
  static handleError(err: any, req: Request, res: Response, next?: NextFunction) {
    if (err.name === 'RESTError') {
      logger.error('REST ERROR', err);
      RESTError.send(res, err.code || 500, err.message, err.info);
    } else if (err.name === 'ValidationError') {
      logger.error('DATA ERROR', err);
      RESTError.send(res, 400, err.message, err.path);    
    } else if (err.name === 'MethodNotAllowed') {
      logger.error('METHOD NOT ALLOWED ERROR', err);
      RESTError.send(res, 405, err.message, err.path);    
    } else {
      logger.error('GENERIC ERROR', err, err.stack);
      RESTError.send(res, 500, 'internal');
    }    
  }
}
