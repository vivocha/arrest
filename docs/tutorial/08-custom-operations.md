# 08 — Custom operations

**Goal:** add an endpoint the generated CRUD set can't give you, and inherit everything else.

This is where the tutorial stops being a tour of what arrest does and starts being about how you extend it. In
the production codebase this manual was checked against, `getCustomInfo` appears in 152 files and `runOperation`
in 90. Chapters 08–10 are the ones you will actually use.

## The code

[examples/tutorial/src/operations/person-statistics.ts](../../examples/tutorial/src/operations/person-statistics.ts):

```ts
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
```

Two methods and a constructor. And the wiring, in
[08-custom-operations.ts](../../examples/tutorial/src/steps/08-custom-operations.ts):

```ts
api.addResource(
  new PersonResource(db, {
    '/statistics': { get: PersonStatisticsOperation },
    ...MongoResource.defaultRoutes(),
  })
);
```

## Run it

```bash
node dist/main.js 08
```

```bash
$ curl -s localhost:3000/people/statistics
[{"count":3,"country":"US","averageAge":86},
 {"count":2,"country":"GB","averageAge":38.5},
 {"count":2,"country":"IT","averageAge":93.5},
 {"count":1,"country":"NL","averageAge":72}]

$ curl -s 'localhost:3000/people/statistics?country=US'
[{"count":3,"country":"US","averageAge":86}]

$ curl -s 'localhost:3000/people/statistics?country=USA'
{"error":400,"message":"ValidationError","info":{"type":"maxLength","path":"query.country",
 "scope":"…#/paths/~1people~1statistics/get/parameters/0/schema"}}
```

Note the `scope` on that error: `#/paths/~1people~1statistics/get/parameters/0/schema`. An inline parameter's
scope is a pointer into the *document*, not into `components`, which is how you tell a hand-written parameter
from one of the [nine reusable ones](../reference/defaults.md#parameters) in an error report.

## What just happened

### Route order is the thing that will bite you

`/people/statistics` also matches `/people/:id`. Express matches in registration order, so whichever is
registered first wins — and the default route table lists `/:id` second only because
[`defaultRoutes()`](../reference/mongo-resource.md#defaultroutes-static) puts `/` first:

```ts
{ '/': { … }, '/:id': { … } }
```

Object key order is route order. Spreading `defaultRoutes()` *after* `/statistics` puts the specific path first,
which is why the example works. Do it the obvious way instead:

```ts
const r = new PersonResource(db);
r.addOperation(new PersonStatisticsOperation(r, '/statistics', 'get'));   // appended: after /:id
api.addResource(r);
```

and you get this:

```bash
$ curl -s localhost:3000/people/statistics
{"error":404,"message":"not_found"}
```

That 404 is `ReadMongoOperation` looking for a person whose `_id` is the string `statistics`, failing the
`ObjectId` conversion, and reporting the 404 chapter 03 measured. Nothing warns you. Worse, **the OpenAPI
document still advertises the path** — `/people/statistics` is right there in `paths`, because the document is
built from the operation list and the router is built from the same list in the same order. The document says
the endpoint exists and the router never reaches it.

The rule, and it is worth writing on the wall:

> **Specific paths before parametric ones.** `/statistics`, then `/`, then `/:id`.

Pass a route table when you need control over the order, and use `addOperation` only for operations whose path
can't collide — or when you have no choice, which chapter 10 covers.

### The subclass wrote two methods; look at what it got

`GET /people/statistics` came out with:

- **the collection**, as `job.coll`, connected and cached — via
  [`MongoOperation.createJob`](../reference/mongo-operations.md#pipeline-steps);
- **an `operationId`** of `Person.statistics`, and therefore a scope of the same name — held on the operation as
  `this.scopes` and enforced by `securityValidator` on every request. It is already being checked; it passes
  because the default `initSecurity` grants `*` and warns about it in the log. Chapter 11 replaces that with a
  real credential and the scope starts meaning something, without this class changing;
- **the `Person` tag**, so it renders beside the CRUD operations rather than in a group of its own;
- **the `default` error response**, `$ref`ing `#/components/responses/defaultError`;
- **the error envelope** — a throw anywhere in `runOperation` becomes `{error, message, info}` with a 500, and an
  `API.fireError(404, …)` becomes a clean 404;
- **CASL record constraints**, because `prepareQuery` calls `super` — see below;
- **the 405** on any other method:

  ```bash
  $ curl -si -X POST localhost:3000/people/statistics | head -1
  HTTP/1.1 405 Method Not Allowed
  ```

That is the trade the framework offers: describe yourself in `getCustomInfo`, do the work in `runOperation`, and
the cross-cutting concerns are inherited rather than repeated in ninety files.

### Why `prepareQuery` calls `super` first

```ts
async prepareQuery(job: MongoJob): Promise<MongoJob> {
  job = await super.prepareQuery(job);      // ← not optional
  if (job.req.query.country) {
    job.query.country = job.req.query.country;
  }
  return job;
}
```

`MongoOperation.prepareQuery` is where a caller's CASL ability is turned into query constraints and merged into
`job.query`. Skip the `super` call, or assign `job.query = {…}` instead of adding to it, and those constraints
are gone — silently, and only for the operation you just wrote. An aggregation that ignores them reports over
records the caller may not read.

So: **call `super`, then add.** Every pipeline step, every time. Chapter 12 shows what is being merged in.

### Which step to override

The [pipeline](../reference/pipeline.md) runs seven steps in order, and the choice of which to override is most
of the design work:

| Step | Override when |
|---|---|
| `createJob` | you need a per-request setting on the job, or to change `feat` |
| `prepareQuery` | you are narrowing *which records* — tenant, owner, a query parameter |
| `prepareDoc` | you are adjusting *what is written* — stamps, derived fields, defaults |
| `prepareOpts` | you are changing projection, sort, limit |
| `runOperation` | **required** — the actual work |
| `redactResult` | you are removing something from the output |
| `processResult` | you are changing *how* it is written |

The mistake to avoid is doing filtering in `runOperation` because it is the method you had to write anyway.
Constraints belong in `prepareQuery`: that is the step abilities also write to, so a constraint expressed there
composes with them instead of fighting them.

### `id`, and why the constructor passes one

```ts
super(resource, path, method, 'statistics');
```

Without the fourth argument the id is derived from the path — `/statistics` → `statistics` for a `GET`, and
`statistics-post` for a `POST`. Same answer here, so why write it? Because the id becomes the `operationId`,
which becomes the **scope name**, which ends up in issued tokens. Deriving it from the path means renaming the
path silently invalidates every token that mentioned it. Name it once, explicitly, and the URL is free to change.

For non-`GET` methods on the resource root the derivation is worth knowing anyway: `/` with a `POST` gives the id
`post`, hence `Person.post` — which is why the built-in operations all pass explicit ids (`query`, `create`,
`read`, `update`, `patch`, `remove`).

### Inherited parameters are inherited *machinery*, not parameters

The pipeline handles `format`, `csv_*` and the paging parameters, but only
[`QueryMongoOperation`](../reference/mongo-operations.md#querymongooperation) *declares* them. This operation
declares only `country`. So:

```bash
$ curl -s 'localhost:3000/people/statistics?limit=1' | jq length
4                                          # limit is undeclared: ignored, not an error

$ curl -s 'localhost:3000/people/statistics?format=jsonl'
{"count":3,"country":"US","averageAge":86}
{"count":2,"country":"GB","averageAge":38.5}
…                                          # this one *works*, because processResult is inherited
```

`format=jsonl` works without being declared, because `createJob` reads `req.query.format` whether or not there is
a validator for it. Which cuts both ways:

```bash
$ curl -s 'localhost:3000/people/statistics?format=csv&csv_fields=country,count'
,,,,,,,,,,,,
,,,,,,,,,,,,
```

Thirteen empty columns. `csv_fields` was never validated, so it arrived as the *string* `"country,count"` rather
than an array; `toCSV` iterated its characters as field paths, and none of them resolved. Undeclared parameters
are the one place arrest will hand you nonsense rather than a 400.

If you want the formats on a custom operation, `$ref` the parameters:

```ts
parameters: [
  { $ref: '#/components/parameters/format' },
  { $ref: '#/components/parameters/csvFields' },
  { $ref: '#/components/parameters/csvOptions' },
  { name: 'country', in: 'query', schema: { … } },
],
```

and they are documented and validated like everything else. If you don't want them, consider overriding
`createJob` to force `feat.format` — otherwise `?format=jsonl` remains reachable and undocumented.

### `getCustomInfo` merges; it does not replace

`info` is `deepExtend({}, getDefaultInfo(), getCustomInfo())` — one merge, at construction time. Consequences:

- **arrays replace, they don't concatenate.** A `parameters` array in `getCustomInfo` wins outright over the
  base's, which is why `QueryMongoOperation` lists all nine `$ref`s rather than adding to something;
- **`responses` merge per status code**, so declaring `200` leaves `default` alone;
- there is no way to *remove* something the base declared. If `getDefaultInfo` gave you a parameter you don't
  want, `delete` it in an override of `getInfo`, or don't inherit from that class.

`info` is also swapped for a getter when the operation attaches (`attach` redefines the property to read from
the API's document), so mutating `this.info` after attach does not do what you expect. Do your describing in
`getCustomInfo` and treat `info` as read-only afterwards.

## Exercises

1. Move `/statistics` after the spread of `defaultRoutes()` and reproduce the 404. Then check `openapi.json`
   still lists the path.
2. `$ref` the `limit` and `skip` parameters into the statistics operation and make them do something in
   `prepareOpts`.
3. Drop the `super.prepareQuery` call and re-run chapter 12's ability requests. What leaks?
4. Add a `POST /people/statistics` with a request body describing a filter, and check the derived id.
5. Remove the `summary` and look at `swaggerScopes` on the operation (log it from a subclass). What description
   does the scope get instead? (Chapter 11 explains why that string ends up in the document.)

---

[← Chapter 07](07-output-formats.md) · [Tutorial index](README.md) · [Chapter 09 →](09-custom-resources.md)
