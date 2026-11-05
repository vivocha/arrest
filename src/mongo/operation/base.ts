import { AnyMongoAbility } from '@casl/ability';
import _ from 'lodash';
import { Collection, CollectionOptions, ObjectId } from 'mongodb';
import { API } from '../../api.js';
import { Job, PipelineOperation } from '../../pipeline.js';
import { APIRequest, APIResponse, Method } from '../../types.js';
import { MongoResource } from '../resource.js';
import { getConditionFields } from '../../util.js';
import { addConstraint, applyProjection, toMongoQuery, unescapeMongoObject } from '../util.js';

export interface MongoJob extends Job {
  coll: Collection;
  // The projection requested by the caller, when the one sent to MongoDB had to include more fields
  projection?: Record<string, number>;
}

export abstract class MongoOperation extends PipelineOperation {
  constructor(public resource: MongoResource, path: string, method: Method, id?: string) {
    super(resource, path, method, id);
  }

  get collection(): Promise<Collection> {
    return this.resource.getCollection(this.getCollectionOptions());
  }
  get requestSchema(): any {
    return this.resource.requestSchema;
  }
  get responseSchema(): any {
    return this.resource.responseSchema;
  }

  protected getCollectionOptions(): CollectionOptions | undefined {
    return undefined;
  }
  protected getItemQuery(_id) {
    try {
      return {
        ['' + this.resource.info.id]: this.resource.info.idIsObjectId ? new ObjectId(_id) : _id,
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
  /**
   * The projection of the requested fields. The conditions of the ability are evaluated on the returned documents,
   * so the fields they depend on are projected as well (even _metadata and _id), and removed by redactResult.
   */
  protected getProjection(job: MongoJob, fields?: string[]) {
    const out = this.parseFields(fields!);
    const requested = { ...out };
    const inclusion = Object.values(out).includes(1);
    const covers = (field: string, other: string) => field === other || field.startsWith(other + '.');
    for (const field of job.req.ability ? this.getAbilityConditionFields(job.req.ability) : []) {
      const keys = Object.keys(out);
      if (inclusion ? !keys.some((k) => out[k] && covers(field, k)) : keys.some((k) => covers(field, k))) {
        // MongoDB rejects a projection with both a field and one of its sub-fields
        keys.filter((k) => covers(k, field) || covers(field, k)).forEach((k) => delete out[k]);
        if (inclusion) {
          out[field] = 1;
        }
        job.projection = requested;
      }
    }
    // An empty projection returns everything, but MongoDB rejects it in a $project stage
    return _.isEmpty(out) ? undefined : out;
  }
  getAbilityConditionFields(ability: AnyMongoAbility): string[] {
    const out: string[] = [];
    if (this.scopes) {
      for (let resource in this.scopes) {
        for (let action in this.scopes[resource]) {
          out.push(...getConditionFields(ability, resource, action));
        }
      }
    }
    return out;
  }
  getAbilityConstraints(ability: AnyMongoAbility): any {
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
    job = (await super.redactResult(job)) as MongoJob;
    if (job.projection && job.data) {
      job.data = applyProjection(job.data, job.projection);
    }
    return job;
  }
}
