import { OpenAPIV3 } from 'openapi-police';
import { API } from '../../api';
import { Method } from '../../types';
import { MongoResource } from '../resource';
import { addConstraint } from '../util';
import { MongoJob, MongoOperation } from './base';

export class RemoveMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'remove') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: `Delete a ${this.resource.info.name} by id`,
      parameters: [
        {
          $ref: '#/components/parameters/id',
        },
      ],
      responses: {
        '200': {
          description: `${this.resource.info.name} successfully deleted`,
        },
        '404': {
          $ref: '#/components/responses/notFound',
        },
        default: {
          $ref: '#/components/responses/defaultError',
        },
      },
    };
  }
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    job = await super.prepareQuery(job);
    job.query = addConstraint(job.query, this.getItemQuery(job.req.params.id));
    return job;
  }
  async runOperation(job: MongoJob): Promise<MongoJob> {
    let opts = job.opts as { w?: number | string; wtimmeout?: number; j?: boolean; bypassDocumentValidation?: boolean };
    let result = await job.coll.deleteOne(job.query, opts);
    if (result.deletedCount != 1) {
      job.req.logger.error('delete failed', result);
      API.fireError(404, 'not_found');
    }
    return job;
  }
}
