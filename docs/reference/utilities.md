# Utilities

Sources: [src/util.ts](../../src/util.ts), [src/mongo/util.ts](../../src/mongo/util.ts)

The functions arrest uses internally and that are useful in your own code: CSV serialization, ability checking,
query merging, key escaping, JSON Patch translation and the document post-processing steps.

## Importing the non-exported modules

[src/index.ts](../../src/index.ts) re-exports `api`, `error`, `operation`, `pipeline`, `resource`, `rpc`,
`types`, `mcp/` and `mongo/` — plus the whole of `@casl/ability`, `@vivocha/scopes` and `openapi-police`. Four
modules are **not** in that list and need a deep import:

```ts
import { checkAbility, CSVOptions, toCSV } from 'arrest/dist/util.js';
import { addConstraint, escapeMongoKey, patchToMongo, toMongoQuery } from 'arrest/dist/mongo/util.js';
import { DEFAULT_DOCUMENT, JSON_SCHEMA_DRAFT_2020_12 } from 'arrest/dist/defaults.js';
import { SchemaResource } from 'arrest/dist/schema.js';
```

Plus one more that is exported from no index at all — the [RQL](rql.md) translator, a default export:

```ts
import rql from 'arrest/dist/mongo/rql.js';
```

The deep paths are declared in `package.json`'s `exports` map, so they are supported, not a workaround of the
package boundary:

```json
{
  ".": "./dist/index.js",
  "./dist/*.js": "./dist/*.js",
  "./dist/mcp/*.js": "./dist/mcp/*.js",
  "./dist/mongo/*.js": "./dist/mongo/*.js",
  "./dist/mongo/operation/*.js": "./dist/mongo/operation/*.js"
}
```

Note they name `dist/`, i.e. the **compiled** path, and end in `.js` even from TypeScript — NodeNext
resolution requires the runtime specifier. `.d.ts` files sit next to the `.js`, so types come through.

The four are utility modules rather than framework surface, which is why they were left out; most code needs
`toCSV`, `checkAbility` and `addConstraint` and nothing else. If you find yourself deep-importing widely, say so
in an [issue](https://github.com/vivocha/arrest/issues) — whether to promote them to the root export is an open
question.

## `src/util.ts`

### `toCSV`

```ts
export function toCSV(data: any[], options: CSVOptions): string

export interface CSVOptions {
  fields: string[] | { [key: string]: string };
  unwind?: string;
  forceUnwind?: boolean;
  separator?: string;
  decimal?: string;
  quotes?: boolean;
  escape?: string;
  eol?: string;
  dateFormat?: string;
  timezone?: string;
  header: boolean;
  filename?: string;
}
```

Serializes an array of objects to CSV. What
[`PipelineOperation.processResult`](pipeline.md#processresult) calls for `format=csv`, and usable directly for
exports, reports and scheduled jobs.

| Option | Effect |
|---|---|
| `fields` | **Required.** An array of paths, or a map of path → column name. Paths are dotted: `address.city` |
| `header` | **Required.** Emit the header row. Column names come from `fields`' values |
| `unwind` | Emit one row per element of the named array field, repeating the other columns |
| `forceUnwind` | Keep an item whose `unwind` field is empty, as one row with that column blank. Also set by prefixing `unwind` with `!` |
| `separator` | Field separator. Default `,` |
| `decimal` | Replace `.` in numbers — `,` for European locales |
| `quotes` | Quote every value, escaping embedded `"` with `escape` (default `\`) |
| `eol` | Line separator. Default `\n` |
| `dateFormat` | [luxon](https://moment.github.io/luxon/#/formatting?id=table-of-tokens) format for `Date` values. Without it, dates are ISO 8601 |
| `timezone` | Zone applied before formatting. Default `UTC`. Only used with `dateFormat` |
| `filename` | Not used by `toCSV`; `processResult` turns it into a `Content-Disposition` header |

```ts
import { toCSV } from 'arrest/dist/util.js';

const csv = toCSV(rows, {
  fields: { name: 'Name', 'address.city': 'City', created: 'Created' },
  header: true,
  separator: ';',
  decimal: ',',
  dateFormat: 'dd/MM/yyyy',
  timezone: 'Europe/Rome',
});
```

Behaviour worth knowing:

- values are read with [eredita](https://github.com/vivocha/eredita)'s `dot`, so a dotted path traverses nested
  objects; a path that doesn't resolve becomes an empty cell, as do `null` and `undefined`;
- everything else is stringified with `.toString()`. An object value becomes `[object Object]` — flatten it in
  `fields` or in a `redactResult` override;
- **without `quotes`, nothing is escaped.** A value containing the separator, a quote or a newline corrupts the
  row. Pass `quotes: true` for anything user-supplied;
- `unwind` starting with `!` sets `forceUnwind` **and mutates the options object**, stripping the `!`. Don't
  reuse one options object across calls if you rely on it;
- only one field can be unwound, and only at the top level.

The `csv_options` query parameter maps onto this interface — see
[defaults.md](defaults.md#csv_options) — except for `fields` and `escape`, which come from `csv_fields`/
`csv_names` and are not settable per request.

### `checkAbility`

```ts
export function checkAbility(
  ability: AnyMongoAbility,
  resource: string,
  action: string,
  data?: any,
  filterFields?: boolean,
  filterData?: boolean
): any
```

The engine behind [`Operation.checkAbility`](operation.md#checkability), `filterFields` and
[field redaction](authorization.md#field-level-redaction). Documented in full in
[authorization.md](authorization.md#checkability) — the flag matrix, the walk's properties and the
memoization.

Prefer the `Operation` methods, which supply `resource` and `action` from the operation's scopes. Call this
directly only outside an operation: a background job applying the same rules, for instance.

### `refsRebaser`

```ts
export function refsRebaser(schemaName: string, obj: any): any
```

Rewrites one `$ref` from JSON-Schema conventions to OpenAPI ones. Passed to jsonref's `rebase` by
[`registerSchema`](api.md#registerschema); the six rules are tabulated in
[schemas.md](schemas.md#ref-rebasing).

Mutates and returns `obj`. `http:`/`https:` refs are left alone.

### `rebaseOASDefinitions`

```ts
export function rebaseOASDefinitions(fullSpec: any): OpenAPIV3.Document
```

Hoists every nested `definitions` object to `components.schemas` under an underscore-joined name and rewrites
the refs. Run by [`API.router()`](api.md#router). Throws
`Error('Unable to rebase schema definitions, check the Schema.')` on anything it can't process. See
[schemas.md](schemas.md#rebaseoasdefinitions).

It rewrites refs by `JSON.stringify` → regex replace → `JSON.parse`, so the document must be JSON-serializable
at that point — which it is, since it runs before jsonref parses it. Don't call it on a parsed document.

### `removeUnusedSchemas`

```ts
export function removeUnusedSchemas(spec: OpenAPIV3.Document): OpenAPIV3.Document
```

Counts `$ref`s and deletes unreferenced `components.schemas` and `components.parameters` entries. **Responses
are counted but never deleted.** A `$ref` pointing at something absent throws. See
[schemas.md](schemas.md#removeunusedschemas).

Also used by [`filterAuthorizedDocument`](api.md#filterauthorizeddocument) to clean up after removing
operations, which is why an over-eager filter can't leave dangling refs behind.

`OccurrencesTable` and `Occurrence` are exported alongside it, describing the internal counting table.

### `removeSchemaDeclaration`

```ts
export function removeSchemaDeclaration(obj: any): any
```

Deletes `$schema` from an object, in place. Applied by `registerSchema`, because a `$schema` inside
`components.schemas` would claim a dialect for a fragment of a document that already declares one via
[`jsonSchemaDialect`](defaults.md#default_document).

Useful when copying a standalone schema file into a document by hand.

## `src/mongo/util.ts`

### `addConstraint`

```ts
export function addConstraint(query: any, constraint: any): any
```

Merges a constraint into a query, handling both filter objects and aggregation pipelines, and **returns the
result** — it does not always mutate, so always use the return value:

```ts
job.query = addConstraint(job.query, { tenant: job.req.headers['x-tenant'] });
```

| `query` | `constraint` | Result |
|---|---|---|
| falsy | object | the constraint |
| object | object, no keys in common | merged with `Object.assign` |
| object | object, keys in common | `{ $and: [query, constraint] }` |
| object with `$or` | object with `$or` | `{ $and: [query, constraint] }` |
| object with `$and` | object | merged into the **last** `$and` element when that is safe, else appended |
| array (pipeline) | object | merged into a trailing `$match` stage, or a new `$match` appended |
| array | array | concatenated |
| object | array | `[{ $match: query }, ...constraint]` |
| anything | non-object (incl. `null`) | `query` unchanged — which is why [`rql`](rql.md) can return `null` |

The keys-in-common check is what keeps two constraints on the same field from overwriting each other: adding
`{ status: 'active' }` to `{ status: { $ne: 'draft' } }` produces an `$and` of both rather than dropping one.

This is the only correct way to add to `job.query` in a [`prepareQuery`](pipeline.md#preparequery) override.
Assigning directly discards the ability constraints `super.prepareQuery` merged in, and breaks outright if
`q` produced an aggregation pipeline.

### `escapeMongoKey` / `unescapeMongoKey`

```ts
export function escapeMongoKey(key: string): string
export const unescapeMongoKey: (key: string) => string = decodeURIComponent;
```

MongoDB reserves `$` at the start of a field name and `.` anywhere in it. `escapeMongoKey` percent-encodes
`%`, `$` and `.` — in that order, so the escaping is reversible — and `unescapeMongoKey` is
`decodeURIComponent`.

```
'a.b'      → 'a%2Eb'
'$set'     → '%24set'
'100%'     → '100%25'
```

Since unescaping is `decodeURIComponent`, a key holding a **literal** `%` sequence that looks like an escape —
`'%41'` written directly into the database, bypassing `escapeMongoObject` — comes back as `'A'`. Escape on the
way in and the round trip is exact.

`unescapeMongoKey` also throws `URIError` on a malformed sequence, so a key written by something other than
arrest can make a read fail. Both are consequences of using percent-encoding, and they only arise if writes
bypass the escaping.

### `escapeMongoObject` / `unescapeMongoObject`

```ts
export function escapeMongoObject(val: any): any
export function unescapeMongoObject(val: any): any
```

Apply the above to every key of an object, recursively, returning a **new** value.
`ObjectId`s, `Date`s and non-objects are returned as they are; arrays are mapped element-wise.

This is what [`escapeProperties`](mongo-resource.md#mongoresourcedefinition) turns on: the Mongo operations
call `escapeMongoObject` in `prepareDoc` and `unescapeMongoObject` in `redactResult`. Call them yourself when
writing to the same collection outside arrest — a migration, an importer — or the two halves will disagree.

Note it escapes keys, never values, and it does not escape `$` in a **query** — so a query you build with
user-supplied field names still needs care.

### `patchToMongo`

```ts
export function patchToMongo(patch: JSONPatch, escape: boolean = false): { query?: any; doc?: any }
```

Translates an [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) JSON Patch into a MongoDB update
document plus the query preconditions the patch implies. Used by
[`PatchMongoOperation`](mongo-operations.md#patchmongooperation); `escape` passes each path segment through
`escapeMongoKey`.

| Op | Produces |
|---|---|
| `add`, path ending in `/-` | `$push` on the parent path |
| `add`, any other path | `$set` |
| `replace` | `$set`, **plus `{ path: { $exists: true } }` in the query** — a replace of an absent field must not create it |
| `move` | `$rename` from → path |
| `remove` | `$unset` |
| `test` | `{ path: value }` **in the query** |
| `copy` | throws `Error('copy not supported')` |

```ts
patchToMongo([
  { op: 'test', path: '/version', value: 3 },
  { op: 'replace', path: '/status', value: 'done' },
  { op: 'add', path: '/tags/-', value: 'urgent' },
]);
// {
//   query: { version: 3, status: { $exists: true } },
//   doc: { $set: { status: 'done' }, $push: { tags: 'urgent' } },
// }
```

JSON Pointer paths become dotted paths, so `/address/city` is `address.city` and `/tags/0` is `tags.0` — which
MongoDB reads as an array index. The `-` end-of-array token is only valid as the last segment of an `add`;
anywhere else, and in every other op, it throws. An empty path throws too.

`copy` is unsupported because MongoDB cannot copy one field to another in a single update without reading the
document first — which would make the operation non-atomic, the property the rest of this translation exists to
preserve.

Because `test` becomes part of the *query*, a failed test is indistinguishable from a missing document: the
operation answers `404`, not `409`.

### `toMongoQuery`

```ts
export function toMongoQuery<T extends AnyMongoAbility>(ability: T, subjectType, action): any
```

Turns a CASL ability's rules for one `(subject, action)` pair into a MongoDB filter. Adapted from
`@casl/mongoose` to avoid the mongoose dependency. Inverted (`cannot`) rules become `$nor`, and a single-branch
`$or` collapses to that branch so the common case is a flat query.

Called by [`MongoOperation.getAbilityConstraints`](mongo-operations.md#getabilityconstraints). See
[record-level constraints](authorization.md#record-level-constraints).

Measured, per rule shape, for one `(subject, action)`:

| Rules | Result |
|---|---|
| `can`, no conditions | `{}` — unrestricted |
| `can` with conditions | the conditions, flat |
| two `can`s with conditions | `{ $or: [ …, … ] }` |
| `can(cond)` + `cannot(cond)` | `{ $or: […], $and: [{ $nor: […] }] }` |
| `can` with **no** conditions + `cannot` **with** conditions | **throws `TypeError`** |
| no rules at all | **throws `TypeError`** |

The last two rows are a bug, not a design: this function reads `out.$or.length` without checking that `$or`
exists, and `rulesToQuery` omits `$or` when the only conditional rules are inverted ones. Through
[`prepareQuery`](mongo-operations.md#pipeline-steps) that surfaces as a **500 on every request**.

Avoid it by writing conditions positively — `can(action, subject, { field: { $in: [...] } })` rather than
`can(action, subject)` plus `cannot(action, subject, { field: { $nin: [...] } })`. A `cannot` with no conditions
is safe, since it removes the action outright and the operation answers 403 before any query is built. The
no-rules row is unreachable in practice for the same reason.

---

[← Defaults](defaults.md) · [Reference index](README.md) · [Types →](types.md)
