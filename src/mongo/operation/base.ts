import { AnyMongoAbility } from '@casl/ability';
import _ from 'lodash';
import { Collection, CollectionOptions, ObjectId } from 'mongodb';
import { API } from '../../api.js';
import { Job, PipelineOperation } from '../../pipeline.js';
import { APIRequest, APIResponse, Method } from '../../types.js';
import { MongoResource } from '../resource.js';
import { getConditionFields } from '../../util.js';
import { addConstraint, removeFields, toMongoQuery, unescapeMongoObject } from '../util.js';

export interface MongoJob extends Job {
  coll: Collection;
  // The fields MongoDB returns only because the conditions of the ability are matched against them, removed by
  // redactResult: each one with its sub-fields that were requested, which are kept
  extraFields?: Record<string, string[]>;
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
   * so the fields they depend on are projected as well (even _metadata and _id): job.extraFields records them, and
   * redactResult removes them. Only them, so whatever a subclass adds to the projection is returned, unless it is
   * one of them: a subclass that wants a condition field returned removes it from job.extraFields too. The projection
   * is always an object, even if empty, so that a subclass can change it.
   */
  protected getProjection(job: MongoJob, fields?: string[]) {
    const out = this.parseFields(fields!);
    const requested = Object.keys(out).filter((k) => out[k]);
    const inclusion = requested.length > 0;
    const covers = (field: string, other: string) => field === other || field.startsWith(other + '.');
    const extra: Record<string, string[]> = {};
    for (const field of job.req.ability ? this.getAbilityConditionFields(job.req.ability) : []) {
      const keys = Object.keys(out);
      if (inclusion ? !keys.some((k) => out[k] && covers(field, k)) : keys.some((k) => covers(field, k))) {
        // MongoDB rejects a projection with both a field and one of its sub-fields
        const overlapping = keys.filter((k) => covers(k, field) || covers(field, k));
        overlapping.forEach((k) => delete out[k]);
        if (inclusion) {
          out[field] = 1;
          // What is removed is the outermost field containing no requested field but the ones inside the added one,
          // which are kept (relative to the removed field, which might contain the added one)
          const path = field.split('.');
          const outside = requested.filter((r) => !covers(r, field));
          let i = 1;
          while (outside.some((r) => covers(r, path.slice(0, i).join('.')))) {
            i++;
          }
          const key = path.slice(0, i).join('.');
          extra[key] = requested.filter((r) => covers(r, field) && r !== field).map((r) => r.slice(key.length + 1));
        } else {
          overlapping.forEach((k) => (extra[k] = []));
        }
      }
    }
    if (!_.isEmpty(extra)) {
      job.extraFields = extra;
    }
    return out;
  }
  /**
   * Whether a rule relevant to this operation's scopes permits or forbids only some fields: when none does, the
   * conditions do not decide which fields of a record are returned, only which records, and the query does that.
   * redactResult then does not match them against the records.
   */
  restrictsFields(ability: AnyMongoAbility): boolean {
    if (this.scopes) {
      for (let resource in this.scopes) {
        for (let action in this.scopes[resource]) {
          if (ability.possibleRulesFor(action, resource).some((r) => r.fields)) {
            return true;
          }
        }
      }
    }
    return false;
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
    // The query already selected the records the conditions permit: unless a rule also restricts the fields, that is
    // all the conditions decide, and they are not matched again. CASL would not always agree with MongoDB (see
    // docs/reference/authorization.md), and the results of an aggregation might not even contain the condition fields
    // Like the rest of the pipeline, feat.filter is optional: a subclass might remove it to do its own redaction
    if (job.req.ability && job.feat?.filter && !this.restrictsFields(job.req.ability)) {
      job.feat.filter.conditions = false;
    }
    job = (await super.redactResult(job)) as MongoJob;
    if (job.extraFields && job.data) {
      job.data = removeFields(job.data, job.extraFields);
    }
    return job;
  }
}
