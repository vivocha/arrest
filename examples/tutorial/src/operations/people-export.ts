import { Job, Method, OpenAPIV3, PipelineOperation, Resource } from 'arrest';
import { Db } from 'mongodb';

/**
 * `GET /reports/people` — the pipeline, one stage at a time.
 *
 * PipelineOperation splits a request into named steps and runs them in a fixed order:
 *
 *   createJob → prepareQuery → prepareDoc → prepareOpts → runOperation → redactResult → processResult
 *
 * Only `runOperation` is abstract; override the stages you care about. Every Mongo operation in arrest is built
 * this way, which is why overriding `prepareQuery` on a MongoOperation works — it is one stage of this pipeline.
 *
 * Two things to know:
 *
 * 1. **Mutate the job, don't replace it.** The stages are declared as `(job) => Promise<Job>`, but the handler
 *    calls them as `await this.prepareQuery(job)` and throws the result away. A stage that builds and returns a
 *    fresh object has no effect at all. Always mutate the job you were given (and return it, so `super` calls
 *    compose).
 * 2. **`processResult` is free money.** Because it is the last stage, `?format=csv` and `?format=jsonl` — and
 *    the JSONP handling — work on any pipeline operation that leaves an array in `job.data`. This operation
 *    doesn't implement formatting; it just declares the parameters and inherits the behaviour.
 */
export class PeopleExportOperation extends PipelineOperation {
  constructor(
    protected db: Db,
    resource: Resource,
    path: string,
    method: Method
  ) {
    super(resource, path, method, 'people');
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Export people, oldest first',
      parameters: [
        { name: 'country', in: 'query', schema: { type: 'string', minLength: 2, maxLength: 2 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'jsonl', 'csv'], default: 'json' } },
        // No `style`: for a query parameter openapi-police accepts only simple, spaceDelimited, pipeDelimited
        // and deepObject — not `form`, which OpenAPI itself makes the default here. Omitting it gives `simple`,
        // i.e. a comma-separated list, which is what every built-in array parameter in arrest uses.
        { name: 'csv_fields', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
      ],
      responses: {
        '200': {
          description: 'The export, in the requested format',
          content: {
            'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/person' } } },
            'application/jsonl': { schema: { type: 'string' } },
            'text/csv': { schema: { type: 'string' } },
          },
        },
      },
    };
  }

  /** Turn validated query parameters into a Mongo filter. */
  async prepareQuery(job: Job): Promise<Job> {
    if (job.req.query.country) {
      job.query.country = job.req.query.country;
    }
    return job;
  }

  /** Everything that isn't the filter: projection, sort, paging. */
  async prepareOpts(job: Job): Promise<Job> {
    job.opts.sort = { age: -1 };
    job.opts.limit = (job.req.query.limit as unknown as number) || 100;
    return job;
  }

  async runOperation(job: Job): Promise<Job> {
    const coll = this.db.collection('people');
    job.data = await coll.find(job.query, job.opts).toArray();
    return job;
  }

  /**
   * The last chance to change the payload before it is written.
   *
   * `super.redactResult` applies the caller's CASL ability (chapter 12) — call it, then add whatever is
   * unconditional. Here: `notes` is marked writeOnly in the schema, which documents an intention but enforces
   * nothing (arrest never validates responses), so removing it is this stage's job. `_id` becomes a string
   * because a raw ObjectId serializes to a shape CSV can't use.
   */
  async redactResult(job: Job): Promise<Job> {
    await super.redactResult(job);
    if (Array.isArray(job.data)) {
      job.data = job.data.map(({ notes, _id, ...rest }) => ({ _id: '' + _id, ...rest }));
    }
    return job;
  }
}
