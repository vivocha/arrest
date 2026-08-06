# Mongo operations

Sources: [src/mongo/operation/](../../src/mongo/operation/)

Six [`PipelineOperation`](pipeline.md) subclasses implementing CRUD over a MongoDB collection, plus the
abstract `MongoOperation` they share. [`MongoResource.defaultRoutes()`](mongo-resource.md#defaultroutes-static)
wires them up; you only name them when building custom routes or subclassing.

| Class | Route | Method | Default `id` |
|---|---|---|---|
| [`QueryMongoOperation`](#querymongooperation) | `/` | `get` | `query` |
| [`CreateMongoOperation`](#createmongooperation) | `/` | `post` | `create` |
| [`ReadMongoOperation`](#readmongooperation) | `/:id` | `get` | `read` |
| [`UpdateMongoOperation`](#updatemongooperation) | `/:id` | `put` | `update` |
| [`PatchMongoOperation`](#patchmongooperation) | `/:id` | `patch` | `patch` |
| [`RemoveMongoOperation`](#removemongooperation) | `/:id` | `delete` | `remove` |

Each constructor is `(resource: MongoResource, path: string, method: Method, id = '<default>')`, so
`operationId` is `<ResourceName>.query`, `<ResourceName>.read` and so on regardless of the path they're
mounted at.

## `MongoOperation`

Source: [src/mongo/operation/base.ts](../../src/mongo/operation/base.ts)

Abstract. Adds the collection, id handling, projection rules and ability constraints to the pipeline.

### `MongoJob`

```ts
interface MongoJob extends Job {
  coll: Collection;
}
```

[`Job`](pipeline.md#job) plus the collection, resolved in `createJob` so every later step has it. In these
operations `job.query` is a MongoDB filter — **or an aggregation pipeline array**, when RQL produced one — and
`job.opts` holds driver options.

### Properties

```ts
get collection(): Promise<Collection>
get requestSchema(): any     // this.resource.requestSchema
get responseSchema(): any    // this.resource.responseSchema
protected getCollectionOptions(): CollectionOptions | undefined
```

`getCollectionOptions` here is **override point** for a single operation, and returns `undefined` by default —
which makes `MongoResource.getCollection` fall back to *its* default parameter, i.e. the resource-level
options. Returning `{}` is not the same thing: it overrides them with nothing.

### `getItemQuery`

```ts
protected getItemQuery(_id): any
```

`{ [info.id]: info.idIsObjectId ? new ObjectId(_id) : _id }`. A value `ObjectId` won't accept raises
`404 not_found` — not a validation error, because a syntactically impossible id simply matches nothing.

### `parseFields`

```ts
protected parseFields(fields: string[]): any
```

Turns a field list into a MongoDB projection:

- always starts from `{ _metadata: 0 }`, so the metadata subdocument never leaves the server;
- adds `_id: 0` when `info.id` is not `_id`, so a resource with a natural key doesn't leak the internal one;
- with a non-empty `fields`, switches to an inclusion projection (`{ field: 1, … }`), dropping the
  `_metadata: 0` exclusion (inclusion already excludes it) and keeping `_id: 0` unless `_id` *is* the
  resource id;
- silently ignores `_metadata`, and ignores `_id` unless it is the resource id — you cannot project either
  back in.

### `getAbilityConstraints`

```ts
getAbilityConstraints(ability: Ability): any
```

Translates the CASL rules relevant to this operation's scopes into a MongoDB filter, merging each
`(subject, action)` pair's `toMongoQuery` result with [`addConstraint`](utilities.md#addconstraint). Returns
`{}` when `scopes` is unset. See [authorization.md](authorization.md#record-level-constraints).

### Pipeline steps

```ts
async createJob(req, res): Promise<MongoJob>
async prepareQuery(job): Promise<MongoJob>
async redactResult(job): Promise<MongoJob>
```

- `createJob` sets `feat.filter = { fields: true, data: false }` — field redaction on, record redaction off,
  because records are filtered in the *query* rather than after the fact — and resolves `job.coll`.
- `prepareQuery` merges `getAbilityConstraints(req.ability)` into `job.query` when the request carries an
  ability. **Always call `super.prepareQuery` first in an override**, or those constraints are lost.
- `redactResult` unescapes document keys when [`escapeProperties`](mongo-resource.md#mongoresourcedefinition)
  is set, then defers to [`PipelineOperation.redactResult`](pipeline.md#redactresult).

## `QueryMongoOperation`

Source: [src/mongo/operation/query.ts](../../src/mongo/operation/query.ts)

`GET /` — the list endpoint, and the only operation that accepts the query, paging and format parameters.

### Parameters

All `$ref`s into [the default document](defaults.md#parameters): `limit`, `skip`, `fields`, `sort`, `query`
(named `q`), `format`, `csvFields`, `csvOptions`, `csvNames`.

### Responses

`200` with three content types — `application/json` (an array of `responseSchema`), `application/jsonl` and
`text/csv` (both `string`) — and three documented headers: `Link`, `Results-Matching`, `Results-Skipped`.

### `prepareQuery`

Adds the [RQL](rql.md) translation of `q` to the query. RQL may produce either a filter object or an
aggregation pipeline array, and may also write `opts.fields` (from `select()`), `opts.sort` and `opts.limit`.

### `prepareOpts`

In order:

1. `opts.limit` from the `limit` parameter, then clamped down to `resource.info.queryLimit` when that is set
   and `limit` isn't strictly below it — so `queryLimit` also becomes the *default* page size, since an absent
   `limit` fails the comparison;
2. `opts.skip` from `skip`;
3. `opts.projection` from `parseFields(opts.fields || req.query.fields)` — an RQL `select()` wins over the
   `fields` parameter;
4. `opts.sort` from the `sort` parameter if given, otherwise whatever RQL set, then converted to a MongoDB
   sort document: a leading `-` means descending, `+` or nothing means ascending.

### `runOperation`

Two branches:

**Aggregation** (`job.query` is an array): appends `$sort` and `$project` stages, then a `$facet` computing
`count` (a `$count` stage) and `data` (`$match: {}` plus `$skip`/`$limit`) in one round trip. Passes
`readPreference` through as an `AggregateOptions` if `opts.readPreference` is set.

**Find** (`job.query` is a filter): a `find` cursor with projection, sort, limit, skip and read preference
applied. `countDocuments` runs as a second query **only when `limit` or `skip` is set**; otherwise the
returned array's length is the total.

Both set `Results-Matching`. `Results-Skipped` is set when `skip` is non-zero, and a `Link` header with
`rel="next"` is added when `skip + limit < matching`, built from the current URL with `limit` and `skip`
rewritten.

Because a next link needs `limit`, a request without one gets no `Link` header even if the result was
truncated by MongoDB's own limits.

### `redactResult`

After the inherited redaction, drops objects with no remaining keys — so a record whose every field the
caller's ability forbade disappears from the list rather than appearing as `{}`. Note `Results-Matching` was
already set from the database count, so it can exceed the number of items actually returned.

## `CreateMongoOperation`

Source: [src/mongo/operation/create.ts](../../src/mongo/operation/create.ts)

`POST /` — creates one document. Request body: `application/json`, `requestSchema`, required. Response: `201`
with the created document and a `Location` header.

### `prepareDoc`

Deep-clones the body, then:

- with `id === '_id'` and `idIsObjectId`, deletes any `_id` the client sent — the server generates it;
- with a custom `id` that is an ObjectId and no value supplied, generates one;
- deletes `_metadata`;
- calls [`checkAbility`](operation.md#checkability) on the document when the request has an ability, so a
  create that would produce a record the caller isn't permitted to own is rejected with `403` before touching
  the database.

A custom non-ObjectId `id` is **not** generated: the client must supply it, and a missing value is only caught
if `requestSchema` requires it.

### `runOperation`

Escapes keys if `escapeProperties`, inserts, sets `Location` to the request URL plus the new id, and sets
status `201`.

Duplicate key errors (`MongoServerError` code `11000`) become `400 duplicate key`; any other driver error
becomes `500 internal`. A unique index is therefore how you turn a natural key into a client-visible
validation failure.

### `redactResult`

Removes `_id` (when the resource id isn't `_id`) and `_metadata` from the echoed document. Note the response
is the document as *inserted*, not as read back, so server-side defaults applied by MongoDB are not reflected.

## `ReadMongoOperation`

Source: [src/mongo/operation/read.ts](../../src/mongo/operation/read.ts)

`GET /:id`. Parameters: `id`, `fields`. Responses: `200` with `responseSchema`, `404` referencing
`#/components/responses/notFound`.

`prepareQuery` merges `getItemQuery(req.params.id)` into the ability-constrained query — so a record the
caller may not see answers `404`, not `403`. `prepareOpts` sets the projection from
`opts.fields || req.query.fields`. `runOperation` does a `findOne` and raises `404 not_found` on a miss.

## `UpdateMongoOperation`

Source: [src/mongo/operation/update.ts](../../src/mongo/operation/update.ts)

`PUT /:id` — a full replace of the document's declared fields. Parameters: `id`. Body: `application/json`,
`requestSchema`, required. Responses: `200`, `404`.

`prepareDoc` clones the body, strips `_id` (when the resource id isn't `_id`) and `_metadata`, runs
[`checkAbility`](operation.md#checkability), forces the id field to the path parameter, escapes keys if
configured, and wraps everything in `{ $set: … }`. It assigns `checkAbility`'s return value, but with
`filterFields` defaulting to `false` that call **throws `403`** on the first forbidden field rather than
filtering — a `PUT` carrying a field the ability forbids is rejected, exactly like a `POST`.

`$set` means this is **not** a true replace: fields present in the stored document but absent from the body
survive. To delete a field, PATCH it with a `remove` op.

`prepareOpts` sets `{ returnDocument: 'after' }`, so the response is the updated document. `runOperation` uses
`findOneAndUpdate` and raises `404 not_found` when nothing matched. `redactResult` strips `_id`/`_metadata` as
in create.

## `PatchMongoOperation`

Source: [src/mongo/operation/patch.ts](../../src/mongo/operation/patch.ts)

`PATCH /:id` — [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) JSON Patch.

The body is declared as `application/json` (not `application/json-patch+json`) holding an array whose items
are one of three shapes:

| Shape | `op` | Required |
|---|---|---|
| value ops | `add`, `replace`, `test` | `op`, `path`, `value` |
| move | `move` | `op`, `from`, `path` |
| remove | `remove` | `op`, `path` |

`copy` is deliberately absent — [`patchToMongo`](utilities.md#patchtomongo) throws on it — because MongoDB
can't copy one field to another in a single update without reading the document first.

### `prepareQuery`

Does all the work:

1. merges `getItemQuery(req.params.id)`;
2. when the request has an ability, converts each op's `path` (and `from`) from a JSON Pointer to a dotted
   field path — dropping `-` and numeric array indices — and checks it with
   [`checkAbilityForPath`](operation.md#checkabilityforpath). A failure is `403 insufficient privileges` with
   the offending op as `info`;
3. calls `patchToMongo(patch, escapeProperties)`, merging the returned `query` (the `test` ops and
   `replace`'s `$exists` preconditions) into `job.query` and putting the update document in `job.doc`.

Because `test` becomes part of the query, a failed `test` is indistinguishable from a missing document: the
response is `404 not_found`, not `409`.

`prepareOpts`, `runOperation` and `redactResult` match [update](#updatemongooperation).

## `RemoveMongoOperation`

Source: [src/mongo/operation/remove.ts](../../src/mongo/operation/remove.ts)

`DELETE /:id`. Parameters: `id`. Responses: `200` with no content, `404`, `default`.

`prepareQuery` adds the item query; `runOperation` does a `deleteOne` and raises `404 not_found` unless
exactly one document was deleted. `job.data` is never set, so
[`processResult`](pipeline.md#processresult) answers `200` with an empty body.

## Subclassing

The Mongo operations are designed to be extended one hook at a time. Passing subclasses in `routes` is how you
change behaviour per operation:

```ts
class TenantQuery extends QueryMongoOperation {
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    await super.prepareQuery(job);
    job.query = addConstraint(job.query, { tenant: job.req.headers['x-tenant'] });
    return job;
  }
}

api.addResource(
  new MongoResource(db, { name: 'Person', namePlural: 'People' }, {
    '/': { get: TenantQuery, post: CreateMongoOperation },
    '/:id': { get: ReadMongoOperation, put: UpdateMongoOperation, delete: RemoveMongoOperation },
  })
);
```

Use [`addConstraint`](utilities.md#addconstraint) rather than assigning into `job.query`: the query may
already be an aggregation pipeline or hold ability constraints, and `addConstraint` merges correctly in both
cases.

---

[← MongoResource](mongo-resource.md) · [Reference index](README.md) · [RQL →](rql.md)
