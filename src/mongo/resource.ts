import { MongoClient, Db } from 'mongodb';
import { Routes, Resource, ResourceDefinition, OperationFactory } from '../resource';

const __db = Symbol();

export interface MongoResourceDefinition extends ResourceDefinition {
  collection?: string;
  idIsObjectId?: boolean;
}

export class MongoResource extends Resource {
  collection?: string;
  idIsObjectId?: boolean;

  constructor(info:MongoResourceDefinition, routes:Routes, db: string | Db) {
    super(info, routes);
    if (!this.collection) {
      this.collection = this.namePlural.toLocaleLowerCase();
    }
    if (typeof db === 'string') {
      this[__db] = MongoClient.connect(db as string);
    } else {
      this[__db] = Promise.resolve(db as Db);
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

  static defaultRoutes(query: OperationFactory, create: OperationFactory, read: OperationFactory, update: OperationFactory, remove: OperationFactory):Routes {
    return {
      '/': {
        'get': query,
        'post': create
      },
      '/:id': {
        'get': read,
        'put': update,
        'delete': remove
      }
    };
  }
}