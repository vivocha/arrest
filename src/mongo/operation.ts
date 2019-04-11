import * as _ from 'lodash';
import * as mongo from 'mongodb';
import { OpenAPIV3 } from 'openapi-police';
import * as qs from 'querystring';
import * as url from 'url';
import { API } from '../api';
import { Operation } from '../operation';
import { APIRequest, APIResponse, Method } from '../types';
import { MongoResource } from './resource';
import rql from './rql';

export interface MongoJob {
  req: APIRequest;
  res: APIResponse;
  coll: mongo.Collection;
  query?: any;
  doc?: any;
  opts?: any;
  data?: any;
}

export abstract class MongoOperation extends Operation {
  static readonly MAX_SCAN = 200;
  static readonly MAX_COUNT_MS = 200;
  
  constructor(public resource: MongoResource, path: string, method: Method, id?: string) {
    super(resource, path, method, id);
  }

  /* TODO is maxScan still supported?
  get maxScan():number {
    return MongoOperation.MAX_SCAN;
  }
  */
  get maxCountMs():number {
    return MongoOperation.MAX_COUNT_MS;
  }
  get collection(): Promise<mongo.Collection> {
    return this.resource.getCollection(this.getCollectionOptions());
  }
  get requestSchema(): any {
    return this.resource.requestSchema;
  }
  get responseSchema(): any {
    return this.resource.responseSchema;
  }

  protected getCollectionOptions(): mongo.DbCollectionOptions | undefined {
    return undefined;
  }
  protected getItemQuery(_id) {
    try {
      return {
        [ '' + this.resource.info.id ]: (this.resource.info.idIsObjectId ? new mongo.ObjectID(_id) : _id)
      };
    } catch (error) {
      API.fireError(404, 'not_found');
    }
  }
  protected parseFields(fields: string[]) {
    let out = { _metadata: 0 };
    if (this.resource.info.id !== '_id') {
      out['_id'] = 0;
    }
    if (fields && fields.length) {
      out = _.reduce(fields, (o: any, i: string) => {
        if (i && i !== '_metadata' && (i !== '_id' || i === this.resource.info.id)) {
          if (i !== '_id') {
            out['_id'] = 0;
          }
          delete out['_metadata'];
          out[i] = 1;
        }
        return o;
      }, out);
    }
    return out;
  }

  async prepareQuery(job:MongoJob): Promise<MongoJob> {
    return job;
  }
  async prepareDoc(job:MongoJob): Promise<MongoJob> {
    return job;
  }
  async prepareOpts(job:MongoJob): Promise<MongoJob> {
    return job;
  }
  abstract async runOperation(job:MongoJob): Promise<MongoJob>;
  async redactResult(job:MongoJob): Promise<MongoJob> {
    return job;
  }
  async processResult(job:MongoJob): Promise<MongoJob> {
    if (job.data) {
      job.res.jsonp(job.data);
    } else {
      job.res.end();
    }
    return job;
  }

  async handler(req:APIRequest, res:APIResponse) {
    try {
      let coll:mongo.Collection = await this.collection;
      let job:MongoJob = { req, res, coll, query: {}, opts: {} };
      await this.prepareQuery(job);
      await this.prepareDoc(job);
      await this.prepareOpts(job);
      req.logger.debug(this.info.operationId, 'query', job.query);
      req.logger.debug(this.info.operationId, 'doc', job.doc);
      req.logger.debug(this.info.operationId, 'opts', job.opts);
      await this.runOperation(job);
      await this.redactResult(job);
      await this.processResult(job);
    } catch(err) {
      this.api.handleError(err, req, res);
    }
  }
}

export class QueryMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'query') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      "summary": `Retrieve a list of ${this.resource.info.namePlural}`,
      "parameters": [
        {
          "$ref": "#/components/parameters/limit"
        },
        {
          "$ref": "#/components/parameters/skip"
        },
        {
          "$ref": "#/components/parameters/fields"
        },
        {
          "$ref": "#/components/parameters/sort"
        },
        {
          "$ref": "#/components/parameters/query"
        }
      ],
      "responses": {
        "200": {
          "description": `List of matching ${this.resource.info.namePlural}`,
          "content": {
            "application/json": {
              "schema": {
                "type": "array",
                "items": this.responseSchema
              }
            }
          },
          "headers": {
            "Link": {
              "description": "Data pagination links, as described in RFC5988. Currently only rel=next is supported",
              "type": "string"
            },
            "Results-Matching": {
              "description": "Total number of resources matching the query",
              "type": "integer",
              "minimum": 0
            },
            "Results-Skipped": {
              "description": "Number of resources skipped to return the current batch of resources",
              "type": "integer",
              "minimum": 0
            }
          }
        }
      }
    };
  }
  async prepareQuery(job:MongoJob): Promise<MongoJob> {
    job.query = {};
    job.opts = {};
    if (job.req.query.q) {
      job.query = rql(job.query, job.opts, job.req.query.q);
    }
    return job;
  }
  async prepareOpts(job:MongoJob): Promise<MongoJob> {
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
  async runOperation(job:MongoJob): Promise<MongoJob> {
    let cursor = job.coll.find(job.query);
    // TODO this is now deprecated: find another way to do it
    //cursor.maxScan(this.maxScan);
    let matching = await cursor.count(false, { // false = ignore limit and skip when counting
      maxTimeMS: this.maxCountMs
    });
    job.res.set('Results-Matching', matching + '');
    if (job.opts.fields) cursor.project(job.opts.fields);
    if (job.opts.sort) cursor.sort(job.opts.sort);
    if (job.opts.limit) cursor.limit(job.opts.limit);
    if (job.opts.skip) cursor.skip(job.opts.skip);
    job.data = await cursor.toArray();
    if (job.opts.skip) {
      job.res.set('Results-Skipped', job.opts.skip);
    }
    if (job.opts.skip + job.opts.limit < matching) {
      let q = Object.assign({}, url.parse(job.req.originalUrl, true).query);
      q.limit = job.opts.limit;
      q.skip = job.opts.skip + job.opts.limit;
      const fullURL = `${job.req.protocol}://${job.req.headers['host']}${job.req.baseUrl}${job.req.path}/?${qs.stringify(q)}`;
      job.res.set('Link', '<' + fullURL + '>; rel="next"');
    }
    return job;
  }
  async redactResult(job:MongoJob): Promise<MongoJob> {
    job.data = (job.data as any[]).filter((i: any) => Object.keys(i).length > 0);
    return job;
  }
}

export class ReadMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'read') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      "summary": `Retrieve a ${this.resource.info.name} by id`,
      "parameters": [
        {
          "$ref": "#/components/parameters/id"
        },
        {
          "$ref": "#/components/parameters/fields"
        }
      ],
      "responses": {
        "200": {
          "description": `The requested ${this.resource.info.name}`,
          "content": {
            "application/json": {
              "schema": this.responseSchema
            }
          },
        },
        "404": {
          "$ref": "#/components/responses/notFound"
        }
      }
    };
  }
  async prepareQuery(job:MongoJob): Promise<MongoJob> {
    job.query = this.getItemQuery(job.req.params.id)
    return job;
  }
  async prepareOpts(job:MongoJob): Promise<MongoJob> {
    job.opts.projection = this.parseFields(job.req.query.fields);
    return job;
  }
  async runOperation(job:MongoJob): Promise<MongoJob> {
    job.data = await job.coll.findOne(job.query, job.opts as mongo.FindOneOptions);
    if (!job.data) {
      API.fireError(404, 'not_found');
    }
    return job;
  }
}

export class CreateMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'create') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    let resourceId = '' + this.resource.info.id;
    return {
      "summary": `Create a new ${this.resource.info.name}`,
      "parameters": [
        {
          "description": `${this.resource.info.name} to be created, omitting ${ (resourceId === '_id' && this.resource.info.idIsObjectId) ? 'the unique identifier (that will be generated by the server) and ' : '' } the metadata`,
          "name": "body",
          "in": "body",
          "required": true,
          "schema": this.requestSchema
        }
      ],
      "responses": {
        "201": {
          "description": `${this.resource.info.name} successfully created`,
          "content": {
            "application/json": {
              "schema": this.responseSchema,
            }
          },
          "headers": {
            "Location": {
              "description": "URI of the newly created resource",
              "type": "string",
              "format": "uri"
            }
          }
        }
      }
    };
  }
  async prepareDoc(job:MongoJob): Promise<MongoJob> {
    job.doc = _.cloneDeep(job.req.body);
    if (this.resource.info.id === '_id' && this.resource.info.idIsObjectId) {
      delete job.doc['_id'];
    } else if (this.resource.info.id && typeof job.doc[this.resource.info.id] === 'undefined' && this.resource.info.idIsObjectId) {
      job.doc[this.resource.info.id] = new mongo.ObjectID();
    }
    delete job.doc._metadata;
    return job;
  }
  async runOperation(job:MongoJob): Promise<MongoJob> {
    try {
      let result = await job.coll.insertOne(job.doc, job.opts as mongo.CollectionInsertOneOptions);
      job.data = result.ops[0];
      const fullURL = `${job.req.protocol}://${job.req.headers['host']}${job.req.baseUrl}${job.req.path}${job.data['' + this.resource.info.id]}`;
      job.res.set('Location', fullURL);
      job.res.status(201);
    } catch(err) {
      if (err && err.name === 'MongoError' && err.code === 11000) {
        job.req.logger.error('duplicate key', err);
        API.fireError(400, 'duplicate key');
      } else {
        job.req.logger.error('bad result', err);
        API.fireError(500, 'internal');
      }
    }
    return job;
  }
  async redactResult(job:MongoJob): Promise<MongoJob> {
    if (this.resource.info.id !== '_id') {
      delete job.data._id;
    }
    delete job.data._metadata;
    return job;
  }
}

export class UpdateMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'update') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      "summary": `Update a ${this.resource.info.name}`,
      "parameters": [
        {
          "$ref": "#/components/parameters/id"
        },
        {
          "description": `The updated ${this.resource.info.name}, minus the unique identifier and the metatadata`,
          "name": "body",
          "in": "body",
          "required": true,
          "schema": this.requestSchema
        }
      ],
      "responses": {
        "200": {
          "description": `${this.resource.info.name} successfully updated`,
          "content": {
            "application/json": {
              "schema": this.responseSchema
            }
          },
        },
        "404": {
          "$ref": "#/components/responses/notFound"
        }
      }
    };
  }
  async prepareQuery(job:MongoJob): Promise<MongoJob> {
    job.query = this.getItemQuery(job.req.params.id)
    return job;
  }
  async prepareDoc(job:MongoJob): Promise<MongoJob> {
    let out = _.cloneDeep(job.req.body);
    if(this.resource.info.id !== '_id') {
      delete out._id;
    }
    out['' + this.resource.info.id] = this.resource.info.idIsObjectId ? new mongo.ObjectID(job.req.params.id) : job.req.params.id;
    delete out._metadata;
    job.doc = {
      $set: out
    };
    return job;
  }
  async prepareOpts(job:MongoJob): Promise<MongoJob> {
    job.opts = { returnOriginal: false };
    return job;
  }
  async runOperation(job:MongoJob): Promise<MongoJob> {
    let result = await job.coll.findOneAndUpdate(job.query, job.doc, job.opts as mongo.FindOneAndReplaceOption);
    if (!result.ok || !result.value) {
      job.req.logger.error('update failed', result);
      API.fireError(404, 'not_found');
    }
    job.data = result.value;
    return job;
  }
  async redactResult(job:MongoJob): Promise<MongoJob> {
    if (this.resource.info.id !== '_id') {
      delete job.data['_id'];
    }
    delete job.data._metadata;
    return job;
  }
}

export class RemoveMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'remove') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      "summary": `Delete a ${this.resource.info.name} by id`,
      "parameters": [
        {
          "$ref": "#/components/parameters/id"
        }
      ],
      "responses": {
        "200": {
          "description": `${this.resource.info.name} successfully deleted`
        },
        "404": {
          "$ref": "#/components/responses/notFound"
        },
        "default": {
          "$ref": "#/components/responses/defaultError"
        }
      }
    };
  }
  async prepareQuery(job:MongoJob): Promise<MongoJob> {
    job.query = this.getItemQuery(job.req.params.id)
    return job;
  }
  async runOperation(job:MongoJob): Promise<MongoJob> {
    let opts = job.opts as { w?: number | string, wtimmeout?: number, j?: boolean, bypassDocumentValidation?: boolean };
    let result = await job.coll.deleteOne(job.query, opts);
    if (result.deletedCount != 1) {
      job.req.logger.error('delete failed', result);
      API.fireError(404, 'not_found');
    }
    return job;
  }
}
