import * as mongo from 'mongodb';
import { JSONPatch, OpenAPIV3, toMongoUpdate } from 'openapi-police';
import { API } from '../../api';
import { Method } from '../../types';
import { MongoResource } from '../resource';
import { addConstraint } from '../util';
import { MongoJob, MongoOperation } from './base';

export class PatchMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'patch') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: `Patch a ${this.resource.info.name}`,
      parameters: [
        {
          $ref: '#/components/parameters/id',
        },
      ],
      requestBody: {
        description: `The updated ${this.resource.info.name}, minus the unique identifier and the metatadata`,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                oneOf: [
                  {
                    type: 'object',
                    required: ['op', 'path', 'value'],
                    additionalProperties: false,
                    properties: {
                      op: { enum: ['add', 'replace', 'test'] },
                      path: { type: 'string', minLength: 1 },
                      value: {},
                    },
                  },
                  {
                    type: 'object',
                    required: ['op', 'from', 'path'],
                    additionalProperties: false,
                    properties: {
                      op: { enum: ['move'] },
                      from: { type: 'string', minLength: 1 },
                      path: { type: 'string', minLength: 1 },
                    },
                  },
                  {
                    type: 'object',
                    required: ['op', 'path'],
                    additionalProperties: false,
                    properties: {
                      op: { enum: ['remove'] },
                      path: { type: 'string', minLength: 1 },
                    },
                  },
                ],
              },
            },
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

    const patch = job.req.body as JSONPatch;

    if (job.req.ability) {
      const permittedFields = this.permittedFields(job.req.ability);
      if (permittedFields.size) {
        const dottedPath = (path) =>
          path
            .split('/')
            .slice(1)
            .filter((i) => i !== '-' && isNaN(parseInt(i)))
            .join('.');

        for (let p of patch) {
          if (!permittedFields.has(dottedPath(p.path)) || (p['from'] && !permittedFields.has(dottedPath(p['from'])))) {
            API.fireError(403, 'insufficient privileges', p);
          }
        }
      }
    }
    const update = toMongoUpdate(patch);
    if (update.query) {
      job.query = addConstraint(job.query, update.query);
    }
    job.doc = update.doc;
    return job;
  }
  async prepareOpts(job: MongoJob): Promise<MongoJob> {
    job.opts = { returnOriginal: false };
    return job;
  }
  async runOperation(job: MongoJob): Promise<MongoJob> {
    let result = await job.coll.findOneAndUpdate(job.query, job.doc, job.opts as mongo.FindOneAndReplaceOption<any>);
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
