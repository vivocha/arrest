import * as decamelize from 'decamelize';
import { MongoClient, Db } from 'mongodb';
import { Routes, Resource, ResourceDefinition } from '../resource';
import { QueryMongoOperation, ReadMongoOperation, CreateMongoOperation, UpdateMongoOperation, RemoveMongoOperation } from './operation';

const __db = Symbol();

export interface MongoResourceDefinition extends ResourceDefinition {
  collection?: string;
  idIsObjectId?: boolean;
}

export class MongoResource extends Resource {
  collection: string;
  idIsObjectId?: boolean;

  constructor(db: string | Db | Promise<Db>, info:MongoResourceDefinition, routes:Routes = MongoResource.defaultRoutes()) {
    super(info, routes);
    if (!this.collection) {
      this.collection = decamelize('' + this.namePlural, '_');
    }
    if (typeof db === 'string') {
      this[__db] = MongoClient.connect(db as string);
    } else {
      this[__db] = Promise.resolve(db as Db | Promise<Db>);
    }
    if (typeof this.id !== 'string') {
      this.id = '_id';
    }
    if (typeof this.idIsObjectId !== 'boolean') {
      this.idIsObjectId = (this.id === '_id');
    }
  }

  get db(): Promise<Db> {
    return this[__db];
  }
  get schema(): any {
    return {};
  }
  get requestSchema(): any {
    return this.schema;
  }
  get responseSchema(): any {
    return this.schema;
  }

  static defaultRoutes():Routes {
    return {
      '/': {
        'get': QueryMongoOperation,
        'post': CreateMongoOperation
      },
      '/:id': {
        'get': ReadMongoOperation,
        'put': UpdateMongoOperation,
        'delete': RemoveMongoOperation
      }
    };
  }
}