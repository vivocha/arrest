import { getLogger } from 'debuggo';
import decamelize from 'decamelize';
import * as _ from 'lodash';
import { Collection, Db, DbCollectionOptions, MongoClient } from 'mongodb';
import { OpenAPIV3 } from 'openapi-police';
import { Resource, ResourceDefinition, Routes } from '../resource';
import { CreateMongoOperation, QueryMongoOperation, ReadMongoOperation, RemoveMongoOperation, UpdateMongoOperation } from './operation';

const logger = getLogger('arrest');

export interface MongoResourceDefinition extends ResourceDefinition {
  collection?: string;
  idIsObjectId?: boolean;
  createIndexes?: boolean;
}

export class MongoResource extends Resource {
  db: Promise<Db>;
  indexesChecked: boolean;

  constructor(db: string | Db | Promise<Db>, public info: MongoResourceDefinition, routes: Routes = MongoResource.defaultRoutes()) {
    super(info, routes);
    if (typeof db === 'string') {
      this.db = MongoClient.connect(db as string, { useUnifiedTopology: true }).then((client) => client.db());
    } else {
      this.db = Promise.resolve(db as Db | Promise<Db>);
    }
    this.indexesChecked = false;
  }

  protected initInfo() {
    super.initInfo();
    if (typeof this.info.id !== 'string') {
      this.info.id = '_id';
    }
    if (typeof this.info.idIsObjectId !== 'boolean') {
      this.info.idIsObjectId = this.info.id === '_id';
    }
    if (!this.info.collection) {
      this.info.collection = decamelize('' + this.info.namePlural, '_');
    }
  }

  get schema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
    return true;
  }
  get requestSchema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
    return this.schema;
  }
  get responseSchema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
    return this.schema;
  }

  async checkCollectionIndexes(coll: Collection): Promise<any> {
    const indexes = this.getIndexes();
    if (indexes && indexes.length) {
      let currIndexes;
      try {
        currIndexes = await coll.indexes();
      } catch (e) {
        currIndexes = [];
      }
      for (let i of indexes) {
        const props = ['unique', 'sparse', 'min', 'max', 'expireAfterSeconds', 'key'];

        let c_i = currIndexes.find((t) => {
          return _.isEqual(_.pick(i, props), _.pick(t, props));
        });
        if (!c_i) {
          if (this.info.createIndexes) {
            logger.info(this.info.name, 'creating missing index', i);
            await coll.createIndex(i.key, _.omit(i, 'key'));
          } else {
            logger.warn(this.info.name, 'missing index', i);
          }
        }
      }
    }
    this.indexesChecked = true;
  }
  async getCollection(opts: DbCollectionOptions = this.getCollectionOptions()): Promise<Collection> {
    let db: Db = await this.db;
    let coll: Collection = await new Promise<Collection>((resolve, reject) => {
      // TODO change this as soon as mongodb typings are fixed. Current version does not let you get a promise if you pass options
      db.collection(this.info.collection as string, opts, (err: any, coll?: Collection) => {
        if (err) {
          reject(err);
        } else {
          resolve(coll);
        }
      });
    });
    if (!this.indexesChecked) {
      await this.checkCollectionIndexes(coll);
    }
    return coll;
  }
  protected getCollectionOptions(): DbCollectionOptions {
    return {};
  }
  protected getIndexes(): any[] | undefined {
    return this.info.id && this.info.id !== '_id'
      ? [
          {
            key: {
              [this.info.id]: 1,
            },
            unique: true,
          },
        ]
      : undefined;
  }

  static defaultRoutes(): Routes {
    return {
      '/': {
        get: QueryMongoOperation,
        post: CreateMongoOperation,
      },
      '/:id': {
        get: ReadMongoOperation,
        put: UpdateMongoOperation,
        delete: RemoveMongoOperation,
      },
    };
  }
}
