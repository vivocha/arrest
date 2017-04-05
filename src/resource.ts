import * as camelcase from 'camelcase';
import * as decamelize from 'decamelize';
import { Router, RouterOptions, NextFunction } from 'express';
import { Swagger } from './swagger';
import { API, APIRequest, APIResponse, APIRequestHandler } from './api';
import { Method, Operation, SimpleOperation } from './operation';

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
  externalDocs?: Swagger.ExternalDocs;
  namePlural?: string;
  id?: string;
  title?: string;
  summaryFields?: string[];
  routes?: Routes;
  [ext: string]: any;
}

export class Resource implements ResourceDefinition {
  name?: string;
  description?: string;
  externalDocs?: Swagger.ExternalDocs;
  namePlural?: string;
  path?: string;
  id?: string;
  title?: string;
  summaryFields?: string[];
  [ext: string]: any;

  constructor(info?: ResourceDefinition, routes?: Routes) {
    if (info && info.routes) {
      if (routes) {
        throw new Error('double routes specification');
      }
      routes = info.routes;
      delete info.routes;
    }
    Object.assign(this, info);
    if (!this.name) {
      this.name = Resource.capitalize(camelcase(this.constructor.name));
    }
    if (!this.namePlural) {
      this.namePlural = this.name + 's';
    }
    this[__operations] = [];
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
    return '/' + (this.path ? this.path : decamelize('' + this.namePlural, '-'));
  }
  get operations():Operation[] {
    return this[__operations];
  }
  get scopeDescription():string {
    return `Unrestricted access to all ${this.namePlural}`;
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
        op = new SimpleOperation(this, pathOrOp as string, method, handler as APIRequestHandler, id);
      }
    } else {
      op = pathOrOp as Operation;
    }
    this.operations.push(op);
    return this;
  }

  attach(api: API) {
    let tag:Swagger.Tag = {
      name: '' + this.name
    };
    if (this.description) tag.description = this.description;
    if (this.externalDocs) tag.externalDocs = this.externalDocs;
    if (this.id) tag['x-id'] = this.id;
    if (this.title) tag['x-title'] = this.title;
    if (this.summaryFields) tag['x-summary-fields'] = this.summaryFields;
    api.registerTag(tag);

    api.registerOauth2Scope('' + this.name, this.scopeDescription);

    this.operations.forEach((op:Operation) => op.attach(api));
  }
  async router(base:Router, options?: RouterOptions): Promise<Router> {
    let r = Router(options);
    let knownPaths = new Set();
    let promises: Promise<Router>[] = [];
    this.operations.forEach((operation: Operation) => {
      knownPaths.add(operation.path);
      promises.push(operation.router(r));
    });
    await Promise.all(promises);
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
