import camelcase from 'camelcase';
import decamelize from 'decamelize';
import { NextFunction, Router, RouterOptions } from 'express';
import { OpenAPIV3 } from 'openapi-police';
import { API } from './api';
import { Operation, SimpleOperation } from './operation';
import { APIRequest, APIRequestHandler, APIResponse, Method } from './types';

const __operations = Symbol();

export interface OperationFactory {
  new(resource:Resource, path:string, method:Method): Operation
}

export interface Routes {
  [path:string]: {
    ["get"]?: OperationFactory | APIRequestHandler;
    ["put"]?: OperationFactory | APIRequestHandler;
    ["post"]?: OperationFactory | APIRequestHandler;
    ["delete"]?: OperationFactory | APIRequestHandler;
    ["options"]?: OperationFactory | APIRequestHandler;
    ["head"]?: OperationFactory | APIRequestHandler;
    ["patch"]?: OperationFactory | APIRequestHandler;
  };
}

export interface ResourceDefinition {
  name?: string;
  description?: string;
  externalDocs?: OpenAPIV3.ExternalDocumentationObject;
  namePlural?: string;
  id?: string;
  title?: string;
  summaryFields?: string[];
  routes?: Routes;
  [ext: string]: any;
}

export class Resource {
  protected operations: Operation[] = [];

  constructor(public info: ResourceDefinition = {}, routes?: Routes) {
    if (info && info.routes) {
      if (routes) {
        throw new Error('double routes specification');
      }
      routes = info.routes;
      delete info.routes;
    }
    if (!this.info.name) {
      this.info.name = Resource.capitalize(camelcase(this.constructor.name));
    }
    if (!this.info.namePlural) {
      this.info.namePlural = this.info.name + 's';
    }
    if (routes) {
      for (let path in routes) {
        let handlers = routes[path];
        for (let method in handlers) {
          this.addOperation(path, method as  Method, handlers[method]);
        }
      }
    }
  }

  get basePath(): string {
    return '/' + (this.info.path ? this.info.path : decamelize('' + this.info.namePlural, '-'));
  }
  get scopeDescription():string {
    return `Unrestricted access to all ${this.info.namePlural}`;
  }

  addOperation(op: Operation): this;
  addOperation(path: string, method: Method, handler: OperationFactory | APIRequestHandler, id?: string): this;
  addOperation(pathOrOp: any, method?: Method, handler?: OperationFactory | APIRequestHandler, id?: string): this {
    let op:Operation;
    if (typeof pathOrOp === 'string') {
      if (!method) {
        throw new Error('invalid method');
      } else if (!handler) {
        throw new Error('invalid handler, must be an Operation constructor or an express RequestHandler');
      } else if (Operation.prototype === handler.prototype || Operation.prototype.isPrototypeOf(handler.prototype)) {
        op = new (handler as OperationFactory)(this, pathOrOp as string, method);
      } else {
        op = new SimpleOperation(handler as APIRequestHandler, this, pathOrOp as string, method, id);
      }
    } else {
      op = pathOrOp as Operation;
    }
    this.operations.push(op);
    return this;
  }

  attach(api: API) {
    let tag: OpenAPIV3.TagObject = {
      name: '' + this.info.name
    };
    if (this.info.description) tag.description = this.info.description;
    if (this.info.externalDocs) tag.externalDocs = this.info.externalDocs;
    if (this.info.id) tag['x-id'] = this.info.id;
    if (this.info.title) tag['x-title'] = this.info.title;
    if (this.info.summaryFields) tag['x-summary-fields'] = this.info.summaryFields;
    api.registerTag(tag);

    api.registerOauth2Scope('' + this.info.name, this.scopeDescription);

    this.operations.forEach((op:Operation) => op.attach(api));
  }
  async router(base:Router, options?: RouterOptions): Promise<Router> {
    let r = Router(options);
    let knownPaths = new Set();
    for (let op of this.operations) {
      knownPaths.add(op.path);
      await op.router(r);
    }
    knownPaths.forEach(path => {
      r.all(path, (req: APIRequest, res: APIResponse, next: NextFunction) => {
        next(API.newError(405, 'Method Not Allowed', "The API Endpoint doesn't support the specified HTTP method for the given resource"));
      });
    });
    base.use(this.basePath, r);
    return r;
  }

  static capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
