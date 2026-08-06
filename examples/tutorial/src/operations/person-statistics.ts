import { MongoJob, MongoOperation, MongoResource, OpenAPIV3, Method } from 'arrest';

/**
 * `GET /people/statistics` — how many people per country, and the average age.
 *
 * A custom MongoOperation: `getCustomInfo` describes it, `runOperation` does the work. Everything else —
 * authorization, the error envelope, the response writing — is inherited.
 *
 * Note the constructor passes an explicit id. Without one, the id would be derived from the path
 * (`statistics`), which works, but naming it keeps the operationId — and therefore the scope — stable if the
 * path ever changes.
 */
export class PersonStatisticsOperation extends MongoOperation {
  constructor(resource: MongoResource, path: string, method: Method) {
    super(resource, path, method, 'statistics');
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Count people by country',
      description: 'Aggregated statistics over the whole collection, optionally restricted to one country.',
      parameters: [
        {
          name: 'country',
          in: 'query',
          description: 'Restrict the statistics to a single ISO 3166-1 alpha-2 country code',
          schema: { type: 'string', minLength: 2, maxLength: 2 },
        },
      ],
      responses: {
        '200': {
          description: 'People per country, most populous first',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['country', 'count'],
                  properties: {
                    country: { type: 'string' },
                    count: { type: 'integer', minimum: 1 },
                    averageAge: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  /**
   * Merging into `job.query` rather than assigning keeps whatever the base put there — in particular the
   * record constraints CASL conditions produce, which is how this operation stays safe under an ability.
   */
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    job = await super.prepareQuery(job);
    if (job.req.query.country) {
      job.query.country = job.req.query.country;
    }
    return job;
  }

  async runOperation(job: MongoJob): Promise<MongoJob> {
    job.data = await job.coll
      .aggregate([
        { $match: job.query },
        { $group: { _id: '$country', count: { $sum: 1 }, averageAge: { $avg: '$age' } } },
        { $project: { _id: 0, country: '$_id', count: 1, averageAge: { $round: ['$averageAge', 1] } } },
        { $sort: { count: -1, country: 1 } },
      ])
      .toArray();
    return job;
  }
}
