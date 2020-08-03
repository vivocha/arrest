import * as _ from 'lodash';
import { OpenAPIV3 } from 'openapi-police';
import * as qs from 'querystring';
import * as url from 'url';
import { Method } from '../../types';
import { MongoResource } from '../resource';
import rql from '../rql';
import { addConstraint } from '../util';
import { MongoJob, MongoOperation } from './base';

export class QueryMongoOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method, id: string = 'query') {
    super(resource, path, method, id);
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: `Retrieve a list of ${this.resource.info.namePlural}`,
      parameters: [
        {
          $ref: '#/components/parameters/limit',
        },
        {
          $ref: '#/components/parameters/skip',
        },
        {
          $ref: '#/components/parameters/fields',
        },
        {
          $ref: '#/components/parameters/sort',
        },
        {
          $ref: '#/components/parameters/query',
        },
      ],
      responses: {
        '200': {
          description: `List of matching ${this.resource.info.namePlural}`,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: this.responseSchema,
              },
            },
          },
          headers: {
            Link: {
              description: 'Data pagination links, as described in RFC5988. Currently only rel=next is supported',
              schema: {
                type: 'string',
              },
            },
            'Results-Matching': {
              description: 'Total number of resources matching the query',
              schema: {
                type: 'integer',
                minimum: 0,
              },
            },
            'Results-Skipped': {
              description: 'Number of resources skipped to return the current batch of resources',
              schema: {
                type: 'integer',
                minimum: 0,
              },
            },
          },
        },
      },
    };
  }
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    job = await super.prepareQuery(job);
    if (job.req.query.q) {
      job.query = addConstraint(job.query, rql({}, job.opts, job.req.query.q as string));
    }
    return job;
  }
  async prepareOpts(job: MongoJob): Promise<MongoJob> {
    if (typeof job.req.query.limit !== 'undefined') {
      job.opts.limit = job.req.query.limit;
    }
    if (typeof job.req.query.skip !== 'undefined') {
      job.opts.skip = job.req.query.skip;
    }
    job.opts.fields = this.parseFields(job.req.query.fields as string[]);
    if (job.req.query.sort) {
      job.opts.sort = job.req.query.sort;
    }
    if (job.opts.sort) {
      job.opts.sort = _.reduce(
        job.opts.sort,
        function (o: any, i: string) {
          if (i[0] === '-') {
            o[i.substr(1)] = -1;
          } else if (i[0] === '+') {
            o[i.substr(1)] = 1;
          } else {
            o[i] = 1;
          }
          return o;
        },
        {}
      );
    }
    return job;
  }
  async runOperation(job: MongoJob): Promise<MongoJob> {
    let cursor = job.coll.find(job.query);
    // TODO this is now deprecated: find another way to do it
    //cursor.maxScan(this.maxScan);
    let matching = await cursor.count(false, {
      // false = ignore limit and skip when counting
      maxTimeMS: this.maxCountMs,
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
  async redactResult(job: MongoJob): Promise<MongoJob> {
    job = await super.redactResult(job);
    job.data = (job.data as any[]).filter((i: any) => Object.keys(i).length > 0);
    return job;
  }
}
