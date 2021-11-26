import * as _ from 'lodash';
import { CollectionAggregationOptions } from 'mongodb';
import { OpenAPIV3 } from 'openapi-police';
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
        {
          $ref: '#/components/parameters/format',
        },
        {
          $ref: '#/components/parameters/csvFields',
        },
        {
          $ref: '#/components/parameters/csvOptions',
        },
        {
          $ref: '#/components/parameters/csvNames',
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
            'text/csv': {
              schema: {
                type: 'string',
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
      job.query = addConstraint(job.query, rql({}, job.opts, job.req.query.q as string, this.resource.info.idIsObjectId ? this.resource.info.id : undefined));
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
    let matching: number | undefined;
    if (Array.isArray(job.query)) {
      if (job.opts.sort) job.query.push({ $sort: job.opts.sort });
      if (job.opts.fields) job.query.push({ $project: job.opts.fields });
      const innerQuery: any[] = [{ $match: {} }];
      if (job.opts.skip) innerQuery.push({ $skip: job.opts.skip });
      if (job.opts.limit) innerQuery.push({ $limit: job.opts.limit });
      job.query.push({
        $facet: {
          count: [{ $count: 'count' }],
          data: innerQuery,
        },
      });
      let opts: CollectionAggregationOptions | undefined = undefined;
      if (job.opts.readPreference) {
        opts = { readPreference: job.opts.readPreference };
      }
      const cursor = job.coll.aggregate(job.query, opts);
      const rawData = await cursor.toArray();
      matching = rawData[0].count[0]?.count || 0;
      job.data = rawData[0].data;
      job.res.set('Results-Matching', matching + '');
    } else {
      const cursor = job.coll.find(job.query);
      if (job.opts.limit || job.opts.skip) {
        matching = await cursor.count(false); // false = ignore limit and skip when counting
      }
      if (job.opts.fields) cursor.project(job.opts.fields);
      if (job.opts.sort) cursor.sort(job.opts.sort);
      if (job.opts.limit) cursor.limit(job.opts.limit);
      if (job.opts.skip) cursor.skip(job.opts.skip);
      if (job.opts.readPreference) cursor.setReadPreference(job.opts.readPreference);
      job.data = await cursor.toArray();
      if (typeof matching !== 'number') {
        matching = job.data?.length || 0;
      }
      job.res.set('Results-Matching', matching + '');
    }
    if (job.opts.skip) {
      job.res.set('Results-Skipped', job.opts.skip);
    }
    if (matching) {
      if (job.opts.skip + job.opts.limit < matching) {
        const host = `${job.req.protocol}://${job.req.headers['host']}`;
        const q = new URL(`${host}${job.req.originalUrl}`).searchParams;
        q.set('limit', job.opts.limit);
        q.set('skip', job.opts.skip + job.opts.limit);
        const fullURL = `${host}${job.req.baseUrl}${job.req.path}/?${q.toString()}`;
        job.res.set('Link', '<' + fullURL + '>; rel="next"');
      }
    }
    return job;
  }
  async redactResult(job: MongoJob): Promise<MongoJob> {
    job = await super.redactResult(job);
    job.data = (job.data as any[]).filter((i: any) => Object.keys(i).length > 0);
    return job;
  }
}
