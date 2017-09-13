import * as _ from 'lodash';
import * as decamelize from 'decamelize';
import { getLogger } from 'debuggo';
import { MongoClient, Db, Collection, DbCollectionOptions } from 'mongodb';
import { Routes, Resource, ResourceDefinition } from '../resource';
import { QueryMongoOperation, ReadMongoOperation, CreateMongoOperation, UpdateMongoOperation, RemoveMongoOperation } from './operation';

const logger = getLogger('arrest');
const __db = Symbol();
const __indexesChecked = Symbol();

export interface MongoResourceDefinition extends ResourceDefinition {
  collection?: string;
  idIsObjectId?: boolean;
  createIndexes?: boolean;
}

export class MongoResource extends Resource {
  collection: string;
  idIsObjectId?: boolean;
  createIndexes?: boolean;

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
    this[__indexesChecked] = false;
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

  async checkCollectionIndexes(coll:Collection): Promise<any> {
    const indexes = this.getIndexes();
    if (indexes && indexes.length) {
      let currIndexes;
      try {
        currIndexes = await coll.indexes();
      } catch(e) {
        currIndexes = [];
      }
      for (let i of indexes) {
        const props = [ 'unique', 'sparse', 'min', 'max', 'expireAfterSeconds', 'key' ];

        let c_i = currIndexes.find(t => {
          return (typeof i.name === 'undefined' || i.name === t.name) && _.isEqual(_.pick(i, props), _.pick(t, props));
        });
        if (!c_i) {
          if (this.createIndexes) {
            logger.info(this.name, 'creating missing index', i);
            await coll.createIndex(i.key, _.omit(i, 'key'));
          } else {
            logger.warn(this.name, 'missing index', i);
          }
        }
      }
    }
    this[__indexesChecked] = true;
  }
  async getCollection(opts?: DbCollectionOptions): Promise<Collection> {
    let db: Db = await this.db;
    let coll: Collection = await new Promise<Collection>((resolve, reject) => {
      // TODO change this as soon as mongodb typings are fixed. Current version does not let you get a promise if you pass options
      db.collection(this.collection, opts || this.getCollectionOptions(), (err: any, coll?: Collection) => {
        if (err) {
          reject(err);
        } else {
          resolve(coll);
        }
      });
    });
    if (!this[__indexesChecked]) {
      await this.checkCollectionIndexes(coll);
    }
    return coll;
  }
  protected getCollectionOptions(): DbCollectionOptions {
    return { };
  }
  protected getIndexes(): any[] | undefined {
    return this.id && this.id !== '_id' ? [
      {
        key: {
          [this.id]: 1
        },
        unique: true
      }
    ] : undefined;
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