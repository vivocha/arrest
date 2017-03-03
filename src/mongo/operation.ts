import * as url from 'url';
import * as qs from 'querystring';
import * as _ from 'lodash';
import { Request, Response } from 'express';
import * as mongo from 'mongodb';
import { Swagger } from '../swagger';
import { API } from '../api';
import { Resource } from '../resource';
import { Method, Operation } from '../operation';
import { MongoResource } from './resource';
import rql from './rql';

export interface MongoJob {
  req: Request;
  res: Response;
  coll: mongo.Collection;
  query?: any;
  doc?: any;
  opts?: any;
  data?: any;
}

export abstract class MongoOperation extends Operation {
  static readonly MAX_SCAN = 200;
  static readonly MAX_COUNT_MS = 200;

  constructor(info:Swagger.Operation, resource:Resource, path:string, method:Method) {
    super(info, resource, path, method);
    // TODO restore these
    //this.maxScan = MongoResource.MAX_SCAN;
    //this.maxCountMs = MongoResource.MAX_COUNT_MS;
  }

  get maxScan():number {
    return MongoOperation.MAX_SCAN;
  }
  get maxCountMs():number {
    return MongoOperation.MAX_COUNT_MS;
  }
  get resource():MongoResource {
    return super.resource as MongoResource;
  }
  get collection(): Promise<mongo.Collection> {
    return this.resource.db.then((db:mongo.Db) => {
      let p: Promise<mongo.Collection> = new Promise((resolve, reject) => {
        db.collection(this.resource.collection, this.getCollectionOptions(), (err: any, collection?: mongo.Collection) => {
          if (err) {
            reject(err);
          } else {
            resolve(collection)
          }
        });
      });
      return p;
    });
  }

  protected getCollectionOptions(): mongo.DbCollectionOptions {
    return undefined;
  }
  protected getItemQuery(id) {
    try {
      return {
        [ this.resource.id ]: (this.resource.idIsObjectId ? new mongo.ObjectID(id) : id)
      };
    } catch (error) {
      console.error('invalid id', error);
      API.fireError(404, 'not_found');
    }
  }
  protected parseFields(fields: string[]) {
    let includeMode = false;
    let out = {};
    if (fields && fields.length) {
      out = _.reduce(fields, (o: any, i: string) => {
        if (!i || i === '_metadata' ||  (this.resource.id !== '_id' && i === '_id')) {
          //no op
        }
        else {
          o[i] = 1;
          includeMode = true;
        }
        return o;
      }, {});
    }
    if (!includeMode) {
      out['_metadata'] = 0;
    }
    if (this.resource.id !== '_id') {
      out['_id'] = 0;
    }
    return out;
  }

  prepareQuery(job:MongoJob): MongoJob | Promise<MongoJob> {
    return job;
  }
  prepareDoc(job:MongoJob): MongoJob | Promise<MongoJob> {
    return job;
  }
  prepareOpts(job:MongoJob): MongoJob | Promise<MongoJob> {
    return job;
  }
  abstract runOperation(job:MongoJob): MongoJob | Promise<MongoJob>;
  redactResult(job:MongoJob): MongoJob | Promise<MongoJob> {
    return job;
  }
  processResult(job:MongoJob): MongoJob | Promise<MongoJob> {
    if (job.data) {
      job.res.jsonp(job.data);
    } else {
      job.res.end();
    }
    return job;
  }

  handler(req:Request, res:Response) {
    this.collection.then((coll: mongo.Collection) => {
      return Promise.resolve({ req, res, coll, query: {}, opts: {} } as MongoJob)
        .then(job => this.prepareQuery(job))
        .then(job => this.prepareDoc(job))
        .then(job => this.prepareOpts(job))
        .then(job => this.runOperation(job))
        .then(job => this.redactResult(job))
        .then(job => this.processResult(job));
    }).catch(err => {
      API.handleError(err, req, res);
    });
  }
}

export class QueryMongoOperation extends MongoOperation {
  prepareQuery(job:MongoJob): MongoJob | Promise<MongoJob> {
    job.query = {};
    job.opts = {};
    if (job.req.query.q) {
      job.query = rql(job.query, job.opts, job.req.query.q);
    }
    return job;
  }
  prepareOpts(job:MongoJob): MongoJob | Promise<MongoJob> {
    if (typeof job.req.query.limit !== 'undefined') {
      job.opts.limit = job.req.query.limit;
    }
    if (typeof job.req.query.skip !== 'undefined') {
      job.opts.skip = job.req.query.skip;
    }
    job.opts.fields = this.parseFields(job.req.query.fields);
    if (job.req.query.sort) {
      job.opts.sort = job.req.query.sort;
    }
    if (job.opts.sort) {
      job.opts.sort = _.reduce(job.opts.sort, function(o: any, i: string) {
        if (i[0] === '-') {
          o[i.substr(1)] = -1;
        } else if (i[0] === '+') {
          o[i.substr(1)] = 1;
        } else {
          o[i] = 1;
        }
        return o;
      }, {});
    }
    return job;
  }
  runOperation(job:MongoJob): MongoJob | Promise<MongoJob> {
    let cursor = job.coll.find(job.query);
    cursor.maxScan(this.maxScan);

    // false = ignore limit and skip when counting
    return cursor.count(false, {
      maxTimeMS: this.maxCountMs
    }).then(matching => {
      job.res.set('Results-Matching', matching + '');
      return matching;
    }, () => {
      return 0;
    }).then(matching => {
      if (job.opts.fields) cursor.project(job.opts.fields);
      if (job.opts.sort) cursor.sort(job.opts.sort);
      if (job.opts.limit) cursor.limit(job.opts.limit);
      if (job.opts.skip) cursor.skip(job.opts.skip);
      return cursor.toArray().then(data => {
        job.data = data;
        if (job.opts.skip) {
          job.res.set('Results-Skipped', job.opts.skip);
        }
        if (job.opts.skip + job.opts.limit < matching) {
          let q = url.parse(job.req.originalUrl, true).query || {};
          q.limit = job.opts.limit;
          q.skip = job.opts.skip + job.opts.limit;
          job.res.set('Link', '<' + Resource.getFullURL(job.req) + '?' + qs.stringify(q) + '>; rel="next"');
        }
        return job;
      });
    });
  }
  redactResult(job:MongoJob): MongoJob | Promise<MongoJob> {
    job.data = (job.data as any[]).filter((i: any) => Object.keys(i).length > 0);
    return job;
  }
}

export class ReadMongoOperation extends MongoOperation {
  prepareQuery(job:MongoJob): MongoJob | Promise<MongoJob> {
    job.query = this.getItemQuery(job.req.params.id)
    return job;
  }
  prepareOpts(job:MongoJob): MongoJob | Promise<MongoJob> {
    if (job.req.query.fields) {
      job.opts.fields = this.parseFields(job.req.query.fields);
    }
    return job;
  }
  runOperation(job:MongoJob): MongoJob | Promise<MongoJob> {
    // TODO stop using find
    return job.coll.find(job.query, job.opts).limit(1).next().then(data => {
      if (data) {
        job.data = data;
        return job;
      } else {
        API.fireError(404, 'not_found');
      }
    });
  }
}

export class CreateMongoOperation extends MongoOperation {
  prepareDoc(job:MongoJob): MongoJob | Promise<MongoJob> {
    job.doc = _.cloneDeep(job.req.body);
    if (this.resource.id === '_id' && this.resource.idIsObjectId) {
      delete job.doc._id;
    }
    delete job.doc._metadata;
    return job;
  }
  runOperation(job:MongoJob): MongoJob | Promise<MongoJob> {
    return job.coll.insertOne(job.doc, job.opts as mongo.CollectionInsertOneOptions).then(result => {
      if (result.insertedCount != 1) {
        console.error('insert failed', result);
        API.fireError(500, 'failed');
      } else if (!result.ops || result.ops.length !== 1) {
        console.error('bad result', result);
        API.fireError(500, 'internal');
      } else {
        job.data = result.ops[0];
        job.res.set('Location', Resource.getFullURL(job.req) + '/' + job.data[this.resource.id]);
        job.res.status(201);
        return job;
      }
    });
  }
  redactResult(job:MongoJob): MongoJob | Promise<MongoJob> {
    if (this.resource.id !== '_id') {
      delete job.data._id;
    }
    delete job.data._metadata;
    return job;
  }
}

export class UpdateMongoOperation extends MongoOperation {
  prepareQuery(job:MongoJob): MongoJob | Promise<MongoJob> {
    job.query = this.getItemQuery(job.req.params.id)
    return job;
  }
  prepareDoc(job:MongoJob): MongoJob | Promise<MongoJob> {
    let out = _.cloneDeep(job.req.body);
    if(this.resource.id === '_id' && this.resource.idIsObjectId) {
      out[this.resource.id] = new mongo.ObjectID(job.req.params.id);
    } else {
      delete out._id;
      out[this.resource.id] = job.req.params.id;
    }
    delete out._metadata;
    job.doc = {
      $set: out
    };
    return job;
  }
  prepareOpts(job:MongoJob): MongoJob | Promise<MongoJob> {
    job.opts = { returnOriginal: false };
    return job;
  }
  runOperation(job:MongoJob): MongoJob | Promise<MongoJob> {
    return job.coll.findOneAndUpdate(job.query, job.doc, job.opts as mongo.FindOneAndReplaceOption).then(result => {
      if (!result.ok || !result.value) {
        console.error('update failed', result);
        API.fireError(404, 'not_found');
      } else {
        job.data = result.value;
        return job;
      }
    });
  }
  redactResult(job:MongoJob): MongoJob | Promise<MongoJob> {
    if (this.resource.id !== '_id') {
      delete job.data._id;
    }
    delete job.data._metadata;
    return job;
  }
}

export class RemoveMongoOperation extends MongoOperation {
  prepareQuery(job:MongoJob): MongoJob | Promise<MongoJob> {
    job.query = this.getItemQuery(job.req.params.id)
    return job;
  }
  runOperation(job:MongoJob): MongoJob | Promise<MongoJob> {
    // TODO remove when mongo typings include a propery type
    let opts = job.opts as { w?: number | string, wtimmeout?: number, j?: boolean, bypassDocumentValidation?: boolean };
    return job.coll.deleteOne(job.query, opts).then(result => {
      if (result.deletedCount != 1) {
        console.error('delete failed', result);
        API.fireError(404, 'not_found');
      } else {
        return job;
      }
    });
  }
}
