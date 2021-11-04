import { Ability } from '@casl/ability';
import * as _ from 'lodash';
import * as mongo from 'mongodb';
import { API } from '../../api';
import { Job, PipelineOperation } from '../../pipeline';
import { APIRequest, APIResponse, Method } from '../../types';
import { MongoResource } from '../resource';
import { addConstraint, toMongoQuery, unescapeMongoObject } from '../util';

export interface MongoJob extends Job {
  coll: mongo.Collection;
}

export abstract class MongoOperation extends PipelineOperation {
  constructor(public resource: MongoResource, path: string, method: Method, id?: string) {
    super(resource, path, method, id);
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

  async createJob(req: APIRequest, res: APIResponse): Promise<MongoJob> {
    const job = (await super.createJob(req, res)) as MongoJob;
    job.feat!.filter = {
      fields: true,
      data: false,
    };
    job.coll = await this.collection;
    return job;
  }
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    job = (await super.prepareQuery(job)) as MongoJob;
    if (job.req.ability) {
      job.query = addConstraint(job.query, this.getAbilityConstraints(job.req.ability));
    }
    return job;
  }
  async redactResult(job: MongoJob): Promise<MongoJob> {
    if (job.data && typeof job.data === 'object') {
      if (this.resource.info.escapeProperties) {
        job.data = unescapeMongoObject(job.data);
      }
    }
    return super.redactResult(job) as Promise<MongoJob>;
  }
}
