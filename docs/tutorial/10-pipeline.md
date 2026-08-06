# 10 — The pipeline

**Goal:** write an operation as a sequence of overridable steps rather than one handler, and see why every Mongo
operation is built that way.

You have been using the pipeline since chapter 08 — `prepareQuery` and `runOperation` are two of its steps. This
chapter uses it directly, from `PipelineOperation` rather than `MongoOperation`, so there is nothing inherited to
confuse the picture.

## The code

[examples/tutorial/src/operations/people-export.ts](../../examples/tutorial/src/operations/people-export.ts):

```ts
export class PeopleExportOperation extends PipelineOperation {
  constructor(protected db: Db, resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'people');
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Export people, oldest first',
      parameters: [
        { name: 'country', in: 'query', schema: { type: 'string', minLength: 2, maxLength: 2 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'jsonl', 'csv'], default: 'json' } },
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

  async prepareQuery(job: Job): Promise<Job> {
    if (job.req.query.country) {
      job.query.country = job.req.query.country;
    }
    return job;
  }

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

  async redactResult(job: Job): Promise<Job> {
    await super.redactResult(job);
    if (Array.isArray(job.data)) {
      job.data = job.data.map(({ notes, _id, ...rest }) => ({ _id: '' + _id, ...rest }));
    }
    return job;
  }
}
```

Four steps of seven, and no `handler`. And the resource, in
[10-pipeline.ts](../../examples/tutorial/src/steps/10-pipeline.ts):

```ts
class ReportResource extends Resource {
  constructor(db: Db) {
    super({ name: 'Report', namePlural: 'Reports', description: 'Bulk exports' });
    this.addOperation(new PeopleExportOperation(db, this, '/people', 'get'));
  }
}
```

Note **why** this one uses `addOperation` with an instance rather than a route table. Route-table entries are
called as `new Factory(resource, path, method)` — arrest does the constructing, so there is nowhere to pass a
`Db`. Construct it yourself and hand it over. That is the whole reason the single-argument overload of
`addOperation` exists, and it's the answer to the constraint chapter 02 flagged.

There is no `/:id` in this resource, so appending is safe here. When it isn't, pass a route table and construct
the parametric operations from it.

## Run it

```bash
node dist/main.js 10
```

```bash
$ curl -s 'localhost:3000/reports/people?limit=3'
[{"_id":"6a743c13…","name":"Rita Levi-Montalcini","email":"rita@example.com","age":103,"country":"IT", …},
 {"_id":"…","name":"Margaret Hamilton","age":88, …},
 {"_id":"…","name":"Grace Hopper","age":85, …}]

$ curl -s 'localhost:3000/reports/people?country=US&limit=2'
[{… Margaret Hamilton …},{… Barbara Liskov …}]

$ curl -s 'localhost:3000/reports/people?format=csv&csv_fields=name,age,country&limit=3'
Rita Levi-Montalcini,103,IT
Margaret Hamilton,88,US
Grace Hopper,85,US
```

The CSV is the point of the chapter: this class contains no CSV code at all.

## What just happened

### `processResult` is inherited, so formats are free

`PeopleExportOperation` implements four steps. The other three came from the base class, and one of them —
[`processResult`](../reference/pipeline.md#processresult) — is where `format=csv`, `format=jsonl` and JSONP live.
Declare the parameters and you have the behaviour:

```bash
$ curl -si 'localhost:3000/reports/people?format=jsonl&limit=2' | grep -i content-type
Content-Type: application/jsonl; charset=utf-8

$ curl -s 'localhost:3000/reports/people?limit=1&callback=cb'
/**/ typeof cb === 'function' && cb([{"_id":"6a743c13…", …}]);
```

Which is the argument for `PipelineOperation` over a plain `Operation` even when you're not touching MongoDB:
whatever your `runOperation` produces, if it's an array, it can be exported.

Note this operation declares `csv_fields` but **not** `csv_options`, and the difference is visible:

```bash
$ curl -s '…&format=csv&csv_fields=name,age&csv_options=header=true'
Rita Levi-Montalcini,103                      # no header. csv_options was a string, spread into nothing useful
Margaret Hamilton,88

$ curl -s -g '…&format=csv&csv_fields=name,age&csv_options[header]=true'
name,age                                      # the bracket form arrives as an object, so the spread works
Rita Levi-Montalcini,103
```

`createJob` does `...((req.query.csv_options as any) || {})`, and spreading the *string* `"header=true"` yields
index-keyed junk that `toCSV` ignores. Declare every parameter you intend to support — `{ $ref:
'#/components/parameters/csvOptions' }` is one line — and don't rely on the undeclared ones working.

### Mutate the job; don't return a new one

The steps are typed `(job: Job) => Promise<Job>`, which reads like a transformation chain. It isn't:

```ts
const job = await this.createJob(req, res);
await this.prepareQuery(job);        // ← the return value is discarded
await this.prepareDoc(job);
```

`handler` keeps using the object `createJob` gave it. A step that builds a fresh object has no effect whatsoever:

```ts
async prepareQuery(job: Job): Promise<Job> {
  return { ...job, query: { replaced: true } };     // measured: job.query is still {}
}
```

That was measured, not inferred — the request came back with `{"query":{}}`. Returning `job` is a convention that
makes `super` calls compose (`job = await super.prepareQuery(job)`), not a mechanism. **Mutate in place.**

The one place a fresh object is correct is `createJob`, which does return the job that gets used:

```ts
async createJob(req: APIRequest, res: APIResponse): Promise<TenantJob> {
  return { ...(await super.createJob(req, res)), tenant: req.headers['x-tenant'] as string };
}
```

### Redaction happens before serialization, and that's the design

```ts
async redactResult(job: Job): Promise<Job> {
  await super.redactResult(job);
  if (Array.isArray(job.data)) {
    job.data = job.data.map(({ notes, _id, ...rest }) => ({ _id: '' + _id, ...rest }));
  }
  return job;
}
```

Two jobs in three lines. `super.redactResult` applies the caller's CASL ability — chapter 12 — so calling it first
means the declarative rules run and this code only handles what they can't express. Then `notes` is dropped and
`_id` is stringified.

Why by hand? Because `notes` is `writeOnly` in the schema and **arrest never validates responses**, so that
keyword documents an intention and enforces nothing. Measured, with a person carrying `notes` in the database:

```bash
$ curl -s 'localhost:3000/reports/people?limit=1'
[{"_id":"6a743f1e…","name":"Notes Person","email":"np@example.com","age":200,"country":"XX"}]
```

No `notes`, and `_id` is a string rather than an `ObjectId`. Remove the `redactResult` override and both come
back. If a field must not leave the server, deleting it in `redactResult` — or an ability that forbids it — is the
only thing that does it.

The ordering is the reason to do it here rather than in `runOperation`: `redactResult` runs *before*
`processResult`, so a CSV export cannot contain a field the redaction removed. Redact in the wrong step and you
have two code paths to keep in sync.

### Every step, and what each is for

| Step | Sets | Typical override |
|---|---|---|
| `createJob` | the job, `feat` | per-request state; forcing a format |
| `prepareQuery` | `job.query` | tenant, owner, query-parameter filters |
| `prepareDoc` | `job.doc` | stamps, derived fields, defaults on write |
| `prepareOpts` | `job.opts` | projection, sort, limit |
| `runOperation` | `job.data` | **required** |
| `redactResult` | `job.data` | remove what the caller may not see |
| `processResult` | the response | a format arrest doesn't know |

They all run, in that order, whether or not they apply — a read still passes through `prepareDoc` with nothing to
do. And a throw anywhere is caught by `handler` and handed to
[`API.handleError`](../reference/api.md#handleerror):

```bash
# a step that throws new Error('boom')
{"error":500,"message":"internal"}
```

Note `handler` calls `handleError` **directly** rather than `next(err)`, so `Operation.errorHandler` is never
reached in a `PipelineOperation`. To map a specific failure to a status code, throw a `RESTError`:

```ts
if (!job.req.query.country) {
  API.fireError(422, 'country required for this export');
}
```

### `prepareOpts` and the missing paging headers

```bash
$ curl -si 'localhost:3000/reports/people?limit=2' | grep -ci results-matching
0
```

No `Results-Matching`, no `Link`. Those are set by
[`QueryMongoOperation.runOperation`](../reference/mongo-operations.md#runoperation), not by the pipeline — a
hand-written operation that wants them sets them itself:

```ts
async runOperation(job: Job): Promise<Job> {
  const coll = this.db.collection('people');
  job.data = await coll.find(job.query, job.opts).toArray();
  job.res.set('Results-Matching', '' + (await coll.countDocuments(job.query)));
  return job;
}
```

The same goes for `queryLimit`: it is a `MongoResource` setting the Mongo query operation reads. This operation
caps itself with the `maximum: 1000` on its own `limit` parameter plus the `default: 100`, which is why
`?limit=2000` is a 400 and a bare request returns 8 rather than everything.

That is the general lesson of the chapter. `PipelineOperation` gives you the *structure* — the steps, the error
handling, the output formats, the ability hook. Everything specific to MongoDB collections lives one level up in
[`MongoOperation`](../reference/mongo-operations.md#mongooperation), and if you want those behaviours you either
extend that class or write them yourself.

### When to extend which

| Base class | You get | Choose it when |
|---|---|---|
| `Operation` | validators, scopes, the error envelope | one-off endpoints, non-array responses, streaming |
| `SimpleOperation` | the above, wrapping a function | a handler you already have |
| `PipelineOperation` | + the steps, output formats, the ability hook | anything that produces a data set |
| `MongoOperation` | + `job.coll`, ability constraints, `parseFields` | anything backed by a collection |
| `QueryMongoOperation` and friends | + parameters, paging, documented responses | a variation on generated CRUD |

Reach for the most specific one that fits. The `PeopleExportOperation` above could have extended
`QueryMongoOperation` and overridden two steps — it doesn't, because the chapter is about the pipeline, but in
your own code that's usually the better trade.

## Exercises

1. Add `{ $ref: '#/components/parameters/csvOptions' }` to the parameters and re-run the header request.
2. Set `Results-Matching` and a `Link` header in `runOperation`, and page through the export.
3. Move the `notes` removal from `redactResult` into `runOperation`'s projection. Which is better, and why?
4. Make the export refuse a request with no `country` using `API.fireError(422, …)`. Check the error body.
5. Rewrite `PeopleExportOperation` as a `QueryMongoOperation` subclass. How many lines did it lose?

---

[← Chapter 09](09-custom-resources.md) · [Tutorial index](README.md) · [Chapter 11 →](11-scopes.md)
