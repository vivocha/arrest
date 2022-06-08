import _ from 'lodash';
import { InsertOneOptions, ObjectId } from 'mongodb';
import { OpenAPIV3 } from 'openapi-police';
import { API } from '../../api.js';
import { Method } from '../../types.js';
import { MongoResource } from '../resource.js';
import { escapeMongoObject } from '../util.js';
import { MongoJob, MongoOperation } from './base.js';

export class CreateMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'create') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    let resourceId = '' + this.resource.info.id;
    return {
      summary: `Create a new ${this.resource.info.name}`,
      requestBody: {
        description: `${this.resource.info.name} to be created, omitting ${
          resourceId === '_id' && this.resource.info.idIsObjectId ? 'the unique identifier (that will be generated by the server) and ' : ''
        } the metadata`,
        content: {
          'application/json': {
            schema: this.requestSchema,
          },
        },
        required: true,
      },
      responses: {
        '201': {
          description: `${this.resource.info.name} successfully created`,
          content: {
            'application/json': {
              schema: this.responseSchema,
            },
          },
          headers: {
            Location: {
              description: 'URI of the newly created resource',
              schema: {
                type: 'string',
                format: 'uri',
              },
            },
          },
        },
      },
    };
  }
  async prepareDoc(job: MongoJob): Promise<MongoJob> {
    job.doc = _.cloneDeep(job.req.body);
    if (this.resource.info.id === '_id' && this.resource.info.idIsObjectId) {
      delete job.doc['_id'];
    } else if (this.resource.info.id && typeof job.doc[this.resource.info.id] === 'undefined' && this.resource.info.idIsObjectId) {
      job.doc[this.resource.info.id] = new ObjectId();
    }
    delete job.doc._metadata;
    if (job.req.ability) {
      this.checkAbility(job.req.ability, job.doc);
    }
    return job;
  }
  async runOperation(job: MongoJob): Promise<MongoJob> {
    try {
      if (this.resource.info.escapeProperties) {
        job.doc = escapeMongoObject(job.doc);
      }
      await job.coll.insertOne(job.doc, job.opts as InsertOneOptions);
      job.data = job.doc;
      const fullURL = `${job.req.protocol}://${job.req.headers['host']}${job.req.baseUrl}${job.req.path}${job.data['' + this.resource.info.id]}`;
      job.res.set('Location', fullURL);
      job.res.status(201);
    } catch (err) {
      if (err && err.name === 'MongoServerError' && err.code === 11000) {
        job.req.logger.error('duplicate key', err);
        API.fireError(400, 'duplicate key');
      } else {
        job.req.logger.error('bad result', err);
        API.fireError(500, 'internal');
      }
    }
    return job;
  }
  async redactResult(job: MongoJob): Promise<MongoJob> {
    job = await super.redactResult(job);
    if (this.resource.info.id !== '_id') {
      delete job.data._id;
    }
    delete job.data._metadata;
    return job;
  }
}
