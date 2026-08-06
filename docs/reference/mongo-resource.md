# `MongoResource`

Source: [src/mongo/resource.ts](../../src/mongo/resource.ts)

A [`Resource`](resource.md) backed by a MongoDB collection. Constructing one gives you the full CRUD set —
list, create, read, update, patch, delete — with querying, projection, paging, validation and authorization
already wired.

```ts
import { MongoResource } from 'arrest';

api.addResource(new MongoResource(process.env.MONGO_URL!, { name: 'Person' }));
```

That serves `GET|POST /people` and `GET|PUT|PATCH|DELETE /people/{id}` against a `people` collection — once
you set `namePlural: 'People'`, since the default plural is a naive `+ 's'`.

## Constructor

```ts
constructor(
  db: string | Db | Promise<Db>,
  info: MongoResourceDefinition,
  routes: MongoRoutes = MongoResource.defaultRoutes()
)
```

| Parameter | Meaning |
|---|---|
| `db` | A connection string, a `Db`, or a promise of one. A string is connected with `MongoClient.connect(db).then(c => c.db())`, so the database name must be in the URL |
| `info` | The [definition](#mongoresourcedefinition). Unlike `Resource`, it is **required** |
| `routes` | Defaults to [`defaultRoutes()`](#defaultroutes-static). Pass your own to add, remove or replace operations |

The connection is a promise held on `this.db`; nothing connects eagerly and a connection failure surfaces on
the first request, not at construction. Share one `Db` promise across resources rather than passing the same
URL to each — a string per resource means a client per resource.

Note `info` is redeclared as a public property of type `MongoResourceDefinition`, so `this.info.collection`
and friends are typed inside subclasses.

## `MongoResourceDefinition`

```ts
interface MongoResourceDefinition extends ResourceDefinition {
  collection?: string;
  idIsObjectId?: boolean;
  createIndexes?: boolean;
  escapeProperties?: boolean;
  queryLimit?: number;
}
```

Everything from [`ResourceDefinition`](resource.md#resourcedefinition), plus:

| Field | Default | Effect |
|---|---|---|
| `id` | `'_id'` | **The name of the identifying field**, not the tag's `x-id` as on `Resource`. This is the field `/:id` matches against |
| `idIsObjectId` | `id === '_id'` | Whether to cast the `id` path parameter with `new ObjectId(...)`. A malformed value then answers `404`, not `400` |
| `collection` | `decamelize(namePlural, '_')` | The collection name. `BlogPost`/`BlogPosts` → `blog_posts` |
| `createIndexes` | `false` | Create the indexes [`getIndexes`](#getindexes) declares when they're missing, instead of only warning |
| `escapeProperties` | `false` | Percent-escape `%`, `$` and `.` in document keys on write and unescape them on read, so arbitrary user keys are storable. See [`escapeMongoKey`](utilities.md#escapemongokey--unescapemongokey) |
| `queryLimit` | — | Hard cap on the `limit` parameter, applied after validation. Without it, `limit`'s own maximum of 100 applies |

Set `id` to a natural key when you have one:

```ts
new MongoResource(db, { name: 'Person', namePlural: 'People', id: 'ssn', createIndexes: true });
```

That makes `GET /people/AAA-BB-CCCC` a lookup on `ssn`, declares a unique index on it, and drops `_id` from
responses (see [`parseFields`](mongo-operations.md#parsefields)).

`escapeProperties` is a storage-format decision: turning it on for a collection that already holds documents
means old documents read back unescaped keys unchanged, but a key containing a `.` written before the flag was
set stays unreachable. Decide before the first write.

## `MongoRoutes`

```ts
interface MongoRoutes extends Routes {
  [path: string]: { [method in Method]?: MongoOperationFactory };
}
interface MongoOperationFactory {
  new (resource: MongoResource, path: string, method: Method): Operation;
}
```

Same shape as [`Routes`](resource.md#routes), narrowed so operations receive a `MongoResource`. Plain Express
handlers are not allowed here — use `addOperation` for those.

## Properties

| Property | Type | Description |
|---|---|---|
| `db` | `Promise<Db>` | The database, always a promise |
| `info` | `MongoResourceDefinition` | The definition, after defaults |
| `indexesChecked` | `boolean` | Whether [`checkCollectionIndexes`](#checkcollectionindexes) has run. Checked once per resource instance, on the first `getCollection` |

## Schemas

```ts
get schema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
get requestSchema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
get responseSchema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
```

**override points.** The schema of a resource document. `schema` defaults to `true` — the JSON Schema that
accepts anything — and the other two default to `schema`, so overriding `schema` alone changes both
directions.

Override them separately when the two differ, which is common: server-assigned fields are `readOnly`, secrets
are `writeOnly`.

```ts
class PersonResource extends MongoResource {
  get schema() {
    // full pointer: a getter is not inside a registered schema, so nothing rebases a short ref here
    return { $ref: '#/components/schemas/person' };  // api.registerSchema('person', …)
  }
}
```

A `$ref` here is resolved by jsonref during [`API.router()`](api.md#router), but it must be the **full**
pointer: rebasing happens only inside schemas passed to `registerSchema`, so `{ $ref: 'person' }` in a getter is
treated as a URL and `router()` fails trying to fetch it.

Use `readOnly`/`writeOnly` inside the schema rather than two separate documents when you can — one annotated
document stays consistent where two drift. Just don't expect `writeOnly` to *do* anything on the way out:
bodies are validated with `context: 'write'`, responses are not validated at all, so keeping a secret out of a
response is up to you.

These getters feed the request bodies and response schemas of the CRUD operations. What arrest does *not* do
is derive the schema from the collection: an un-overridden `MongoResource` validates nothing about document
shape.

## Collections and indexes

### `getCollection`

```ts
async getCollection(opts: CollectionOptions = this.getCollectionOptions()): Promise<Collection>
```

Awaits `db`, gets the collection, and on the first call checks its indexes. Every Mongo operation calls this
through [`MongoOperation.collection`](mongo-operations.md#properties).

### `getCollectionOptions`

```ts
protected getCollectionOptions(): CollectionOptions
```

**override point.** Driver `CollectionOptions` — `readPreference`, `readConcern`, `writeConcern`. Empty by
default.

```ts
protected getCollectionOptions(): CollectionOptions {
  return { readPreference: 'secondaryPreferred' };
}
```

### `getIndexes`

```ts
protected getIndexes(): any[] | undefined
```

**override point.** The indexes this resource needs, as driver index specs (`{ key, unique?, sparse?, … }`).
By default: a single unique index on `info.id` when it isn't `_id`, and `undefined` otherwise.

```ts
protected getIndexes() {
  return [
    ...(super.getIndexes() || []),
    { key: { email: 1 }, unique: true, sparse: true },
    { key: { created: -1 } },
    { key: { expires: 1 }, expireAfterSeconds: 0 },
  ];
}
```

### `checkCollectionIndexes`

```ts
async checkCollectionIndexes(coll: Collection): Promise<any>
```

Compares `getIndexes()` against the collection's actual indexes and either creates the missing ones (when
`info.createIndexes`) or logs `missing index` at warn level. Sets `indexesChecked` either way, so it runs once
per resource instance.

Two indexes are considered the same when `unique`, `sparse`, `min`, `max`, `expireAfterSeconds` and `key` all
match. Names are not compared, so an index created by hand under a different name is recognized — but a
difference in any *other* option (collation, partial filter expression) is invisible, and the index is
considered present.

Nothing is ever dropped or altered: an existing index whose options differ is reported as missing and, with
`createIndexes` on, the create attempt fails with the driver's error. Reserve `createIndexes: true` for
development and single-tenant deployments; in production let it warn and manage indexes as migrations.

### `defaultRoutes` (static)

```ts
static defaultRoutes(): MongoRoutes
```

```ts
{
  '/':    { get: QueryMongoOperation, post: CreateMongoOperation },
  '/:id': { get: ReadMongoOperation, put: UpdateMongoOperation,
            delete: RemoveMongoOperation, patch: PatchMongoOperation },
}
```

Build on it to serve a subset or add paths:

```ts
const routes = MongoResource.defaultRoutes();
delete routes['/:id'].delete;                        // read-mostly resource
routes['/:id/history'] = { get: HistoryOperation };  // extra path

api.addResource(new MongoResource(db, { name: 'Person', namePlural: 'People' }, routes));
```

Insertion order is registration order, and Express matches in that order — a literal path added *after*
`/:id` is shadowed by it. Put specific paths before parametric ones, which for the object above means
rebuilding it rather than assigning into it. See
[route order](../guide/07-express-integration.md#route-order).

## Subclassing

Real projects extend `MongoResource` mainly to supply schemas, indexes and derived defaults:

```ts
class PersonResource extends MongoResource {
  constructor(db: Promise<Db>) {
    super(db, { name: 'Person', namePlural: 'People', id: 'ssn', createIndexes: true });
  }
  get schema() {
    return { $ref: 'person' };
  }
  protected initInfo() {
    super.initInfo();
    this.info.description = 'People, keyed by SSN';
  }
  protected getIndexes() {
    return [...(super.getIndexes() || []), { key: { surname: 1, name: 1 } }];
  }
}
```

For behaviour that varies per operation — extra filters, injected fields, custom redaction — subclass the
[Mongo operations](mongo-operations.md) instead and pass them in `routes`.

---

[← PipelineOperation](pipeline.md) · [Reference index](README.md) · [Mongo operations →](mongo-operations.md)
