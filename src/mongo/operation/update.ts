import _ from 'lodash';
import { FindOneAndUpdateOptions, ObjectId } from 'mongodb';
import { OpenAPIV3 } from 'openapi-police';
import { API } from '../../api.js';
import { Method } from '../../types.js';
import { MongoResource } from '../resource.js';
import { addConstraint, escapeMongoObject } from '../util.js';
import { MongoJob, MongoOperation } from './base.js';

export class UpdateMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'update') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: `Update a ${this.resource.info.name}`,
      parameters: [
        {
          $ref: '#/components/parameters/id',
        },
      ],
      requestBody: {
        description: `The updated ${this.resource.info.name}, minus the unique identifier and the metatadata`,
        content: {
          'application/json': {
            schema: this.requestSchema,
          },
        },
        required: true,
      },
      responses: {
        '200': {
          description: `${this.resource.info.name} successfully updated`,
          content: {
            'application/json': {
              schema: this.responseSchema,
            },
          },
        },
        '404': {
          $ref: '#/components/responses/notFound',
        },
      },
    };
  }
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    job = await super.prepareQuery(job);
    job.query = addConstraint(job.query, this.getItemQuery(job.req.params.id));
    return job;
  }
  async prepareDoc(job: MongoJob): Promise<MongoJob> {
    let out = _.cloneDeep(job.req.body);
    if (this.resource.info.id !== '_id') {
      delete out._id;
    }
    delete out._metadata;
    if (job.req.ability) {
      out = this.checkAbility(job.req.ability, out);
    }
    out['' + this.resource.info.id] = this.resource.info.idIsObjectId ? new ObjectId(job.req.params.id) : job.req.params.id;
    if (this.resource.info.escapeProperties) {
      out = escapeMongoObject(out);
    }
    job.doc = {
      $set: out,
    };
    return job;
  }
  async prepareOpts(job: MongoJob): Promise<MongoJob> {
    job.opts = { returnDocument: 'after' };
    return job;
  }
  async runOperation(job: MongoJob): Promise<MongoJob> {
    let result = await job.coll.findOneAndUpdate(job.query, job.doc, job.opts as FindOneAndUpdateOptions);
    if (!result.ok || !result.value) {
      job.req.logger.error('update failed', result);
      API.fireError(404, 'not_found');
    }
    job.data = result.value;
    return job;
  }
  async redactResult(job: MongoJob): Promise<MongoJob> {
    job = await super.redactResult(job);
    if (this.resource.info.id !== '_id') {
      delete job.data['_id'];
    }
    delete job.data._metadata;
    return job;
  }
}
