import { Router, RouterOptions, Request, Response, NextFunction } from 'express';
import { Swagger } from './swagger';
import { API } from './api';
import { Method, Operation } from './operation';

const __operations = Symbol();

export interface OperationFactory {
  new(resource:Resource, path:string, method:Method): Operation
}

export interface Routes {
  [path:string]: {
    ["get"]?: OperationFactory;
    ["put"]?: OperationFactory;
    ["post"]?: OperationFactory;
    ["delete"]?: OperationFactory;
    ["options"]?: OperationFactory;
    ["head"]?: OperationFactory;
    ["patch"]?: OperationFactory;
  };
}

export interface ResourceDefinition extends Swagger.Tag {
  namePlural?: string;
  id?: string;
  title?: string;
  summaryFields?: string[];
}

export class Resource implements ResourceDefinition {
  name: string;
  description?: string;
  externalDocs?: Swagger.ExternalDocs;
  namePlural?: string;
  id?: string;
  title?: string;
  summaryFields?: string[];

  constructor(info:ResourceDefinition, routes:Routes) {
    Object.assign(this, info);
    if (!this.namePlural) {
      this.namePlural = this.name + 's';
    }
    this[__operations] = [];
    for (let path in routes) {
      let factories = routes[path];
      for (let method in factories) {
        this.addOperation(new factories[method](this, path, method));
      }
    }
  }

  get basePath(): string {
    return '/' + Resource.uncapitalize(this.namePlural);
  }
  get operations():Operation[] {
    return this[__operations];
  }
  get scopeDescription():string {
    return `Unrestricted access to all ${this.namePlural}`;
  }

  addOperation(op:Operation): this {
    this.operations.push(op);
    return this;
  }
  attach(api:API) {
    let tag:Swagger.Tag = {
      name: this.name
    };
    if (this.description) tag.description = this.description;
    if (this.externalDocs) tag.externalDocs = this.externalDocs;
    if (this.id) tag['x-id'] = this.id;
    if (this.title) tag['x-title'] = this.title;
    if (this.summaryFields) tag['x-summary-fields'] = this.summaryFields;
    api.addTag(tag);

    api.addOauth2Scope(this.name, this.scopeDescription);

    this.operations.forEach((op:Operation) => op.attach(api));
  }
  router(base:Router, options?: RouterOptions): Promise<Router> {
    return new Promise(resolve => {
      let r = Router(options);
      let knownPaths = new Set();
      let promises: Promise<Router>[] = [];
      this.operations.forEach((operation: Operation) => {
        knownPaths.add(operation.path);
        promises.push(operation.router(r));
      });
      resolve(Promise.all(promises).then(() => {
        knownPaths.forEach(path => {
          r.all(path, (req: Request, res: Response, next: NextFunction) => {
            next(API.newError(405, 'Method Not Allowed', "The API Endpoint doesn't support the specified HTTP method for the given resource"));
          });
        });
        base.use(this.basePath, r);
        return r;
      }));
    });
  }

  static uncapitalize(s) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
}
