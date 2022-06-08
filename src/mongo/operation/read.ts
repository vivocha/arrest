import { FindOptions } from 'mongodb';
import { OpenAPIV3 } from 'openapi-police';
import { API } from '../../api.js';
import { Method } from '../../types.js';
import { MongoResource } from '../resource.js';
import { addConstraint } from '../util.js';
import { MongoJob, MongoOperation } from './base.js';

export class ReadMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'read') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: `Retrieve a ${this.resource.info.name} by id`,
      parameters: [
        {
          $ref: '#/components/parameters/id',
        },
        {
          $ref: '#/components/parameters/fields',
        },
      ],
      responses: {
        '200': {
          description: `The requested ${this.resource.info.name}`,
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
  async prepareOpts(job: MongoJob): Promise<MongoJob> {
    job.opts.projection = this.parseFields(job.req.query.fields as string[]);
    return job;
  }
  async runOperation(job: MongoJob): Promise<MongoJob> {
    job.data = await job.coll.findOne(job.query, job.opts as FindOptions);
    if (!job.data) {
      API.fireError(404, 'not_found');
    }
    return job;
  }
}
