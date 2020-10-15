import { Ability } from '@casl/ability';
import { toMongoQuery } from '@casl/mongoose';
import * as _ from 'lodash';
import * as mongo from 'mongodb';
import { API } from '../../api';
import { Operation } from '../../operation';
import { APIRequest, APIResponse, Method } from '../../types';
import { MongoResource } from '../resource';
import { addConstraint } from '../util';

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
  get maxCountMs(): number {
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
        ['' + this.resource.info.id]: this.resource.info.idIsObjectId ? new mongo.ObjectID(_id) : _id,
      };
    } catch (error) {
      API.fireError(404, 'not_found');
    }
  }
  protected parseFields(fields: string[]) {
    let out: any = { _metadata: 0 };
    if (this.resource.info.id !== '_id') {
      out['_id'] = 0;
    }
    if (fields && fields.length) {
      out = _.reduce(
        fields,
        (o: any, i: string) => {
          if (i && i !== '_metadata' && !(i === '_id' && i !== this.resource.info.id)) {
            if (i !== '_id' && !out['_id']) {
              out['_id'] = 0;
            }
            delete out['_metadata'];
            out[i] = 1;
          }
          return o;
        },
        out
      );
    }
    return out;
  }
  getAbilityConstraints(ability: Ability): any {
    const out = {};
    if (this.scopes) {
      for (let resource in this.scopes) {
        for (let action in this.scopes[resource]) {
          addConstraint(out, toMongoQuery(ability, resource, action));
        }
      }
    }
    return out;
  }

  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    if (job.req.ability) {
      job.query = this.getAbilityConstraints(job.req.ability);
    }
    return job;
  }
  async prepareDoc(job: MongoJob): Promise<MongoJob> {
    return job;
  }
  async prepareOpts(job: MongoJob): Promise<MongoJob> {
    return job;
  }
  abstract async runOperation(job: MongoJob): Promise<MongoJob>;
  async redactResult(job: MongoJob): Promise<MongoJob> {
    if (job.data && typeof job.data === 'object' && job.req.ability) {
      job.data = this.filterFields(job.req.ability, job.data);
    }
    return job;
  }
  async processResult(job: MongoJob): Promise<MongoJob> {
    if (job.data) {
      job.res.jsonp(job.data);
    } else {
      job.res.end();
    }
    return job;
  }

  async handler(req: APIRequest, res: APIResponse) {
    try {
      let coll: mongo.Collection = await this.collection;
      let job: MongoJob = { req, res, coll, query: {}, opts: {} };
      await this.prepareQuery(job);
      await this.prepareDoc(job);
      await this.prepareOpts(job);
      req.logger.debug(this.info.operationId, 'query', job.query);
      req.logger.debug(this.info.operationId, 'doc', job.doc);
      req.logger.debug(this.info.operationId, 'opts', job.opts);
      await this.runOperation(job);
      await this.redactResult(job);
      await this.processResult(job);
    } catch (err) {
      this.api.handleError(err, req, res);
    }
  }
}
