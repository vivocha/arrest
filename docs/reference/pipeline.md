# `PipelineOperation`

Source: [src/pipeline.ts](../../src/pipeline.ts)

An [`Operation`](operation.md) whose `handler` is fixed and whose *steps* are overridable. Instead of writing
a handler, you implement `runOperation` and hook into the steps around it. Every
[Mongo operation](mongo-operations.md) is a `PipelineOperation`, and so is most real extension code.

## The pipeline

```ts
async handler(req, res) {
  try {
    const job = await this.createJob(req, res);
    await this.prepareQuery(job);
    await this.prepareDoc(job);
    await this.prepareOpts(job);
    await this.runOperation(job);
    await this.redactResult(job);
    await this.processResult(job);
  } catch (err) {
    this.api.handleError(err, req, res);
  }
}
```

Seven steps, one shared mutable [`Job`](#job). Every step receives the job and returns it; **the return value
is ignored** — `handler` keeps using the object it created — so mutate `job` in place. Returning `job` is the
convention, not a requirement.

| Step | Purpose | Override to |
|---|---|---|
| [`createJob`](#createjob) | Build the job from the request | add your own fields to `job`, change format handling |
| [`prepareQuery`](#preparequery) | Decide *which* records | add filters, tenant constraints, ability constraints |
| [`prepareDoc`](#preparedoc) | Decide *what data* to write | inject timestamps, ownership, derived fields |
| [`prepareOpts`](#prepareopts) | Decide *how* — projection, sort, limit | change paging or projection rules |
| [`runOperation`](#runoperation) | Do the work, set `job.data` | **required**; the operation itself |
| [`redactResult`](#redactresult) | Remove what the caller may not see | add redaction beyond CASL's |
| [`processResult`](#processresult) | Write the response | emit a format arrest doesn't know |

Any step may throw: a [`RESTError`](errors.md) becomes its status code, anything else a `500`. `handler`
catches everything and hands it to [`API.handleError`](api.md#handleerror) — note it calls `handleError`
**directly**, not `next`, so a `PipelineOperation` never reaches
[`Operation.errorHandler`](operation.md#errorhandler).

Steps run in this order regardless of whether they're relevant: a read operation still passes through
`prepareDoc`, it just has nothing to do there.

## `Job`

```ts
interface Job {
  req: APIRequest;
  res: APIResponse;
  query?: any;
  doc?: any;
  opts?: any;
  data?: any;
  feat?: {
    filter?: { fields: boolean; data: boolean };
    format?:
      | { type: 'json' }
      | { type: 'jsonl'; filename?: string }
      | ({ type: 'csv'; filename?: string } & CSVOptions);
  };
}
```

| Field | Meaning |
|---|---|
| `req`, `res` | The Express request and response |
| `query` | Which records the operation addresses. A MongoDB filter in the Mongo operations |
| `doc` | The data to write. The validated request body in create/update |
| `opts` | How to do it. Driver options (`projection`, `sort`, `limit`, `skip`) in the Mongo operations |
| `data` | The result. Set by `runOperation`, sent by `processResult` |
| `feat.filter` | Whether [`redactResult`](#redactresult) filters fields, records, or both |
| `feat.format` | The response format; set by `createJob` from the `format` query parameter |

`Job` has no index signature, so a subclass adding its own fields should extend the interface — that's what
[`MongoJob`](mongo-operations.md#mongojob) does with its `coll` field:

```ts
interface TenantJob extends Job {
  tenant: string;
}

class TenantOperation extends PipelineOperation {
  async createJob(req: APIRequest, res: APIResponse): Promise<TenantJob> {
    return { ...(await super.createJob(req, res)), tenant: req.headers['x-tenant'] as string };
  }
  async runOperation(job: TenantJob): Promise<TenantJob> { /* … */ }
}
```

## Steps

### `createJob`

```ts
async createJob(req: APIRequest, res: APIResponse): Promise<Job>
```

Returns a job with `query` and `opts` set to `{}`, and `feat.filter` set to
`{ fields: true, data: true }` — both kinds of redaction on by default.

It also reads the response format from the query parameters:

- `format=csv` **with a non-empty `csv_fields`** sets `feat.format` to `{ type: 'csv', ... }`, merging
  `csv_options` and, when `csv_names` has exactly as many entries as `csv_fields`, turning the field list into
  a `{ field: header }` map. `format=csv` *without* `csv_fields` leaves the format unset and the response is
  JSON — the field list is what makes a CSV possible.
- `format=jsonl` sets `{ type: 'jsonl' }`.
- anything else, including `format=json`, leaves `feat.format` undefined.

Those parameters come from [the default document](defaults.md); an operation only accepts them if it declares
them. The Mongo [query operation](mongo-operations.md#querymongooperation) does.

Override to add fields to the job, or to call `super` and then adjust `feat`.

### `prepareQuery`

```ts
async prepareQuery(job: Job): Promise<Job>
```

No-op by default. The single most useful override: narrow what the operation can reach, before it reaches it.

```ts
async prepareQuery(job: Job): Promise<Job> {
  await super.prepareQuery(job);
  job.query.tenant = job.req.headers['x-tenant'];
  return job;
}
```

Always call `super` first in a Mongo subclass — the base implementation is where ability constraints are
merged in, and skipping it silently removes them.

### `prepareDoc`

```ts
async prepareDoc(job: Job): Promise<Job>
```

No-op by default. Where the Mongo create/update operations copy the request body into `job.doc`.

### `prepareOpts`

```ts
async prepareOpts(job: Job): Promise<Job>
```

No-op by default. Where the Mongo query operation resolves projection, sort, limit and skip.

### `runOperation`

```ts
abstract runOperation(job: Job): Promise<Job>
```

**Required.** Do the work and set `job.data`. Leave `job.data` undefined to answer `204`-style with an empty
body (`processResult` calls `res.end()`).

### `redactResult`

```ts
async redactResult(job: Job): Promise<Job>
```

Calls [`checkAbility`](operation.md#checkability) on `job.data` when **all** of these hold: `req.ability` is
set, `job.data` is a non-null object, and at least one of `feat.filter.fields`/`feat.filter.data` is true.
`job.data` is replaced by the filtered value.

With no `req.ability` on the request this does nothing — scope-based authorization is all-or-nothing per
operation, and there is nothing to redact within a permitted response. Field-level redaction requires
abilities.

Override to redact things CASL can't express:

```ts
async redactResult(job: Job): Promise<Job> {
  await super.redactResult(job);
  if (job.data?.secret && !job.req.scopes?.match('admin')) {
    delete job.data.secret;
  }
  return job;
}
```

### `processResult`

```ts
async processResult(job: Job): Promise<Job>
```

Writes the response:

| `job.data` | `feat.format.type` | Response |
|---|---|---|
| falsy | — | `res.end()` — empty body, status as already set |
| array | `csv` | [`toCSV`](utilities.md#tocsv), `content-type: text/csv` |
| array | `jsonl` | one JSON document per line, `content-type: application/jsonl` |
| anything else | — | `res.jsonp(job.data)` |

`csv` and `jsonl` require an **array**; a single object falls through to JSON. Both set
`content-disposition: attachment; filename="…"` when `feat.format.filename` is set.

`res.jsonp` means a `callback` query parameter wraps the response in a JavaScript call. That's Express's
default and arrest doesn't disable it; if you don't want JSONP, override this step or set Express's
`jsonp callback name` to something no client will send.

Note `processResult` writes but doesn't set a status, so an operation needing something other than `200` sets
it earlier — as [`CreateMongoOperation`](mongo-operations.md#createmongooperation) does with `201`.

## `SimplePipelineOperation`

```ts
class SimplePipelineOperation extends PipelineOperation {
  constructor(customRunner: PipelineOperationRunner, resource: Resource, path: string, method: Method, id?: string)
}
interface PipelineOperationRunner {
  (job: Job): Promise<Job>;
}
```

A `PipelineOperation` whose `runOperation` is a function you pass in — the whole pipeline with a default
everything and just the work supplied:

```ts
const op = new SimplePipelineOperation(
  async (job) => {
    job.data = { now: new Date().toISOString() };
    return job;
  },
  resource,
  '/time',
  'get'
);
resource.addOperation(op);
```

Unlike [`SimpleOperation`](operation.md#simpleoperation), this is not created for you by
[`addOperation`](resource.md#addoperation) — a bare function there becomes a `SimpleOperation`. Construct it
yourself when you want redaction and format handling without writing a class.

---

[← Operation](operation.md) · [Reference index](README.md) · [MongoResource →](mongo-resource.md)
