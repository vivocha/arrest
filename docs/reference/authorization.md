# Authorization

Sources: [src/operation.ts](../../src/operation.ts), [src/util.ts](../../src/util.ts),
[src/mongo/util.ts](../../src/mongo/util.ts), [src/api.ts](../../src/api.ts)

arrest authorizes per operation, from one method —
[`Operation.getAuthorizationError`](operation.md#getauthorizationerror) — and supports two credential models:
**scopes**, which say what a caller may do, and **CASL abilities**, which additionally say to which records and
fields. This page is the mechanics; the reasoning is in
[the security model guide](../guide/06-security-model.md).

## The shape of it

```
initSecurity                 you set req.scopes and/or req.ability
      │
      ├─ securityValidator   enforces on a real request        → 401 / 403
      ├─ isAuthorized        reports without dispatching       → MCP tools/list, MCP catalogue
      └─ filterAuthorizedDocument                              → GET /openapi.json?filter=authorized
```

All three call `getAuthorizationError`. Add a requirement by overriding that one method and the three stay
consistent by construction.

## Scopes

`Scopes` comes from [`@vivocha/scopes`](https://github.com/vivocha/scopes) and is re-exported by arrest.

A scope is `category.operation`; a bare `category` means `category.*`. A leading `-` makes it a **denial**.

```ts
import { Scopes } from 'arrest';

new Scopes('Person.read Person.query');     // two specific permissions
new Scopes('Person');                       // Person.*  — everything on Person
new Scopes('* -Person.remove');             // everything except removing people
new Scopes(['*.read', '*.query']);          // read-only across all resources
```

| Method | Meaning |
|---|---|
| `match(scopes)` | Whether this set satisfies **all** of `scopes`. What `getAuthorizationError` calls |
| `filter(scopes)` | The intersection, as a new `Scopes` |
| `set(category, operation, value)` | Grant (`true`) or deny (`false`) one permission |
| `toArray()` / `toString()` | Serialize back |

Matching prefers the most specific entry: an exact `category.operation` beats `category.*`, which beats
`*.operation`, which beats `*.*`. So `-Person.remove` in a set that also holds `*` denies exactly that one
operation.

### Where an operation's scopes come from

[`Operation.attach`](operation.md#attach) registers the names from
[`swaggerScopes`](operation.md#swaggerscopes) — by default a single scope named after `operationId`, so
`Person.read`, `Person.query`, `Person.create` and so on — and sets `operation.scopes` to a `Scopes` built from
them. [`Resource.attach`](resource.md#attach) additionally registers a resource-wide scope named after
`info.name`, which is what makes `Person` (i.e. `Person.*`) grant every operation of the resource.

An operation is public only when `swaggerScopes` is **empty** — the security scheme has no bearing on it. With
no scheme in the document the operations are still enforced; the scopes are merely undocumented, since
[`registerOauth2Scope`](api.md#registeroauth2scope) has nowhere to write them. Declare one anyway, so a client
can discover the names:

```ts
api.document.components!.securitySchemes = {
  oauth2: {
    type: 'oauth2',
    flows: { clientCredentials: { tokenUrl: '/token', scopes: {} } },
  },
};
```

`flows[*].scopes` is filled in for you as operations attach — and **before `addResource`**, because each
operation reads the scheme while attaching to build its own `security` entry. Declare it afterwards and the
scope map still fills in, but the document says nothing about which operations require what.

### Setting them on a request

```ts
class MyAPI extends API {
  initSecurity(req: APIRequest, res: APIResponse, next: NextFunction): void {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) {
      return next();                       // anonymous: public operations still work
    }
    try {
      req.scopes = new Scopes(verify(token).scope);
      next();
    } catch (err) {
      next(API.newError(401, 'invalid token'));
    }
  }
}
```

Pass no credential rather than an error when there is no credential: each operation decides whether it needed
one. See [`initSecurity`](api.md#initsecurity).

## Abilities

An ability is a [CASL](https://casl.js.org) `Ability` on `req.ability`. arrest maps its own vocabulary onto
CASL's directly: the scope's **category is the CASL subject**, and the scope's **operation is the CASL
action**. So `can('read', 'Person')` satisfies the `Person.read` scope.

```ts
import { defineAbility } from 'arrest';

class MyAPI extends API {
  initSecurity(req: APIRequest, res: APIResponse, next: NextFunction): void {
    const user = /* … */;
    req.ability = defineAbility((can, cannot) => {
      if (user.role === 'admin') {
        can('manage', 'all');
      } else {
        can(['read', 'query'], 'Person', ['name', 'surname', 'email'], { owner: user.id });
        can('update', 'Person', ['email'], { owner: user.id });
        cannot('remove', 'Person');
      }
    }) as Ability;
    next();
  }
}
```

That grants three things at once, and arrest uses each in a different place:

| CASL feature | arrest uses it for |
|---|---|
| action + subject | whether the operation may run at all — [`checkAbility`](#checkability) with no data |
| **fields** (`['name', …]`) | which properties survive in responses and are accepted in bodies — [field redaction](#field-level-redaction) |
| **conditions** (`{ owner: … }`) | which records the query can reach — [record constraints](#record-level-constraints) — and which fields of each record are permitted — [conditions in memory](#conditions-in-memory) |

When both `req.ability` and `req.scopes` are set, **the ability wins**: `getAuthorizationError` checks the
ability and never looks at the scopes.

`Ability`, `defineAbility`, `ForbiddenError` and the rest of `@casl/ability` are re-exported from `arrest`.

## `checkAbility`

```ts
// src/util.ts
export function checkAbility(
  ability: AnyMongoAbility,
  resource: string,
  action: string,
  data?: any,
  filterFields?: boolean,
  filterData?: boolean,
  matchConditions: boolean = true,
  originals?: WeakMap<object, any>
): any
```

The engine behind [`Operation.checkAbility`](operation.md#checkability), which calls it once per
`(subject, action)` pair in the operation's scopes, threading `data` through. Each check removes what it
forbids, so a later one could miss the fields its conditions depend on: with more than one pair,
`Operation.checkAbility` takes a copy of the data first (`snapshotData`) and passes it as `originals`, which the
conditions are matched against instead.

**With no `data`**: a plain `throwUnlessCan(action, resource)` — throws CASL's `ForbiddenError`, returns
`undefined`.

**With `data`**, it walks the value recursively and checks each **leaf** against the ability using its dotted
path as the CASL field. Two flags decide what happens to a violation:

| `filterFields` | `filterData` | Behaviour |
|---|---|---|
| `false` | `false` | throw `403 insufficient privileges` on the first forbidden field |
| `true` | `false` | delete forbidden fields (and forbidden array elements) and return the rest |
| any | `true` | additionally drop whole records the ability's *conditions* reject, before walking fields |

Each record (each item, for a list) is checked as the CASL subject, so the rules' conditions are matched
against it — see [conditions in memory](#conditions-in-memory). With `matchConditions: false` only the subject
*type* is checked, as if every condition of a `can` held and every condition of a `cannot` did not: that is for
data that is not a stored record, like the body of a write.

The walk has a few properties worth knowing:

- `ObjectId`s and `Date`s are treated as scalars, not objects to descend into;
- for arrays, each element is checked with the **same path** — the index is not part of the field path, which
  is what lets `can('read', 'Person', ['tags'])` permit a whole array;
- in an array, a forbidden element is dropped (`filterFields`) rather than emptying the array;
- results are memoized per path for the duration of one call — and, with conditions, per combination of
  conditional rules a record matches — so a wide array of uniform objects costs one check per distinct path;
- an object all of whose children were removed is checked as a leaf at its own path — so permitting
  `c.**` permits the container.

CASL field patterns apply: `c.**` matches any depth under `c`, `c.*` one level.

### `filterFields` and `permittedFields`

```ts
operation.filterFields(ability, data);   // = checkAbility(ability, data, true) — filter, don't throw
operation.permittedFields(ability);      // Set<string> of permitted field names, '**' when unrestricted
```

`permittedFields` is the introspective form: useful for building a projection or telling a client what it may
send. It reports rules, not a decision about data.

### `checkAbilityForPath`

```ts
operation.checkAbilityForPath(ability, 'address.city');   // boolean
```

Checks one dotted field path without any data, and returns `true` when the operation has no scopes. Used by
[`PatchMongoOperation`](mongo-operations.md#patchmongooperation) to authorize each JSON Patch target: there is
no document in hand at that point, only the paths the patch will touch.

## Field-level redaction

Field redaction happens in [`PipelineOperation.redactResult`](pipeline.md#redactresult), on the way out, and in
`prepareDoc`, on the way in:

| Direction | Where | Mode |
|---|---|---|
| response | `redactResult` | **filters** — `feat.filter`, which Mongo operations set to `{ fields: true, data: false }` |
| create body | [`CreateMongoOperation.prepareDoc`](mongo-operations.md#createmongooperation) | **throws** — a create carrying a forbidden field is `403` |
| update body | [`UpdateMongoOperation.prepareDoc`](mongo-operations.md#updatemongooperation) | **throws** — same, measured |
| patch paths | [`PatchMongoOperation.prepareQuery`](mongo-operations.md#patchmongooperation) | **throws** `403` with the offending op as `info` |

Bodies, patch paths and the responses of create, update and patch are checked by subject type only
(`feat.filter.conditions` is `false` in those operations): a body is not a complete record, the conditions of an
update apply to the record *before* it — the query enforces them — and the record after it may no longer
match.

Note the asymmetry between the two directions: a response is *filtered* silently, while a request body carrying
a field the ability forbids is *rejected*. Both write paths pass `filterFields: false`, so neither drops a field
quietly — a client that sends what it may not write gets told. Only `redactResult` filters, and only because a
response has no one to complain to.

Redaction only runs when `req.ability` is set. With scope-based authorization there is nothing to redact:
either the operation was permitted or it wasn't.

## Conditions in memory

The query only guarantees that a record matches *some* rule. Which fields of it are permitted depends on which
rules it matches, so on the way out every record is checked in memory, by CASL, against the conditions:

```ts
can('read', 'Contact', ['id', 'name']);
can('read', 'Contact', ['notes'], { campaign: 'A' });
```

```
GET /contacts?fields=id,notes
→ [{ "id": "c1", "notes": "…" },   // campaign A
   { "id": "c2" }]                  // campaign B: notes removed
```

The fields the conditions depend on are projected even when the client did not ask for them — `campaign`
above, and even `_metadata` or `_id`, which [`parseFields`](mongo-operations.md#parsefields) otherwise never
returns — and removed again before the response. Only them: the fields a subclass adds to the projection in
`prepareOpts` are returned.

### Aggregations

When a subclass of `QueryMongoOperation` turns `job.query` into an aggregation pipeline, the results might not
contain the condition fields — those of a `$group`, for instance. What happens then depends on the rules:

- **no rule restricts the fields** (`can('read', 'Contact', { owner: 'u1' })`): the conditions only decide which
  records are reachable, and the `$match` of `job.query` already applied them. The results are not matched
  again, and are returned whole;
- **some rule restricts the fields** (`can('read', 'Contact', ['campaign'], { owner: 'u1' })`): the conditions
  are matched against each result, since nothing else can decide its fields. A result without the condition
  fields matches none, so it has no permitted field and is dropped. Keep the condition fields in the results
  (in the `_id` of a `$group`, for instance), or remove them in `redactResult` after `super.redactResult`.

### Supported operators

CASL's default conditions matcher only implements
[a subset of the MongoDB operators](https://casl.js.org/v6/en/guide/conditions-in-depth#supported-operators):

`$eq` `$ne` `$lt` `$lte` `$gt` `$gte` `$in` `$nin` `$all` `$size` `$regex` `$exists` `$elemMatch`

Notably, **no logical operators**: CASL leaves out `$and`, `$or`, `$nor` and `$not` on purpose, because rules
already express them — the fields of one conditions object are ANDed, more `can` rules for the same action and
subject are ORed, and `cannot` rules negate.

A condition using anything else (`$or`, `$expr`, `$mod`, `$type`, `$geoWithin`, …) **never matches in
memory**. CASL returns `false` without an error, and where its parser throws instead (e.g. on
`$expr: { $gt: […] }`), arrest treats that as `false` too. MongoDB has no such limit, so the query still selects
the records, but every field those rules would permit is removed:

```ts
can(['read', 'query'], 'Contact', { $expr: { $eq: ['$owner', userId] } });
```

| Request | Response |
|---|---|
| `GET /contacts` | `200 []` — the owner's records are found, then emptied and dropped |
| `GET /contacts/<own id>` | `200 {}` |
| `GET /contacts/<someone else's id>` | `404` — the query still applies the condition |

arrest deliberately does not fall back to checking the type alone when a condition is unsupported: that would
grant every field the condition was meant to restrict (and ignore the conditions of `cannot` rules), and
whether a record's fields are visible would depend on arrest second-guessing CASL. The verdict is exactly
CASL's `ability.can` on the record, so what a rule does in a CASL unit test is what arrest enforces.

What a condition that never matches does depends on the rule:

- in a `can` rule, it shows up as **missing data**: the fields the rule permits are removed;
- in a `cannot` rule restricted to some fields, it is a **leak**: those fields are not part of the query (only
  `cannot` rules without fields become a `$nor` there), so nothing else forbids them, and they are returned on
  every record.

```ts
can('read', 'Contact');
cannot('read', 'Contact', ['salary'], { $expr: { $eq: ['$type', 'employee'] } });
// → salary is returned for every contact, employees included
```

Write the conditions with the supported operators instead:

```ts
// not: can('read', 'Contact', { $or: [{ owner: userId }, { public: true }] });
can('read', 'Contact', { owner: userId });
can('read', 'Contact', { public: true });

// not: can('read', 'Contact', { $or: [{ team: 't1' }, { team: 't2' }] });
can('read', 'Contact', { team: { $in: ['t1', 't2'] } });

// not: can('read', 'Contact', { $and: [{ owner: userId }, { status: 'open' }] });
can('read', 'Contact', { owner: userId, status: 'open' });
```

### Custom conditions matcher

If rewriting the rules is not practical, build the ability with a conditions matcher that supports the logical
operators (see [Customize ability](https://casl.js.org/v6/en/advanced/customize-ability) in the CASL docs). Their
parsing instructions and interpreters come from `@ucast/mongo2js`, which the application has to install:

```ts
import { buildMongoQueryMatcher, createMongoAbility } from '@casl/ability';
import { $and, $nor, $or, and, nor, or } from '@ucast/mongo2js';

const conditionsMatcher = buildMongoQueryMatcher({ $and, $or, $nor }, { and, or, nor });
req.ability = createMongoAbility(rules, { conditionsMatcher });
```

arrest uses the ability as it is: whatever the matcher supports works in memory too, and the fields inside
`$and`, `$or` and `$nor` are projected for it. The [differences from MongoDB](#differences-from-mongodb) remain.

### Differences from MongoDB

Even with the supported operators, CASL's matcher does not always agree with MongoDB. The query selects the
records the way MongoDB does, then the in-memory check decides differently:

| Condition | MongoDB | In memory | Write instead |
|---|---|---|---|
| `{ deletedAt: null }` | matches `null` **and** a missing field | matches `null` only | store the field (as `null`), or use `{ deletedAt: { $exists: false } }` for the missing case |
| `{ name: /^A/ }` | a regular expression | an equality with the `RegExp` object: never matches | `{ name: { $regex: /^A/ } }` |
| `{ name: { $in: [/^A/] } }` | a regular expression | an equality: never matches | `{ name: { $regex: /^A/ } }`, or more rules |
| `{ tags: ['a', 'b'] }`, also with `$eq` or `$in` | matches the array `['a', 'b']` (in that order) | compares arrays by reference: never matches | `{ tags: { $all: ['a', 'b'], $size: 2 } }`, which also matches `['b', 'a']` |
| `{ tags: { $ne: ['a', 'b'] } }`, also with `$nin` | does not match the array `['a', 'b']` | compares arrays by reference: always matches | no equivalent: do not compare whole arrays |
| `{ meta: { secret: 'x' } }`, and the other comparisons of a whole embedded document | matches the document `{ secret: 'x' }` | compares objects by reference, as arrays | `{ 'meta.secret': 'x' }`, which also matches documents with more fields |

Where such a condition does not match, the [consequences above](#supported-operators) apply: missing data
for a `can` rule, a leak for a `cannot` restricted to some fields — `cannot('read', 'Contact', ['salary'],
{ approvedAt: null })` does not forbid `salary` on records that have no `approvedAt` field.

A condition that matches in memory but not in MongoDB, like `$ne` on a whole array, leaks the other way: with
`can('read', 'Contact', ['id'])` and `can('read', 'Contact', ['notes'], { tags: { $ne: ['a', 'b'] } })`, the
records tagged `['a', 'b']` are read for the first rule, and `notes` is returned for the second one.

## Record-level constraints

CASL conditions become part of the MongoDB query, so forbidden records are never read rather than being
filtered afterwards.

```ts
// src/mongo/util.ts
export function toMongoQuery<T extends AnyMongoAbility>(ability: T, subjectType, action): any
```

Adapted from `@casl/mongoose` to avoid the mongoose dependency. Turns the ability's rules for one
`(subject, action)` into a filter, with inverted (`cannot`) rules becoming `$nor`. A single-branch `$or`
collapses to that branch, so the common case produces a flat query.

[`MongoOperation.getAbilityConstraints`](mongo-operations.md#getabilityconstraints) calls it once per pair in
the operation's scopes and merges the results, and
[`MongoOperation.prepareQuery`](mongo-operations.md#pipeline-steps) merges *that* into `job.query`.

So `can('read', 'Person', { owner: 'u1' })` turns `GET /people/xyz` into a query for
`{ _id: xyz, owner: 'u1' }` — and a record belonging to someone else answers **404**, not 403. That is the
intended behaviour: a `403` would confirm the record exists.

Three consequences:

- **`Results-Matching` counts what the query matched**, so it already accounts for record constraints — but
  not for [field redaction dropping fully-redacted records](mongo-operations.md#redactresult), so the header
  can exceed the number of items in the body.
- Constraints are only applied by the operations that call `super.prepareQuery`. An override that builds
  `job.query` from scratch without calling super **removes them silently**.
- **Write conditions positively.** `can(action, subject)` combined with `cannot(action, subject, {…})` makes
  `toMongoQuery` throw, and every request a 500 — see [the measured table](utilities.md#tomongoquery).

### `addConstraint`

```ts
// src/mongo/util.ts
export function addConstraint(query: any, constraint: any): any
```

Merges a constraint into a query that may be a filter object *or* an aggregation pipeline, and returns the
result — see [utilities.md](utilities.md#addconstraint) for the merge rules. Always use it instead of
assigning into `job.query`.

## Making an operation public

Return an empty `swaggerScopes`:

```ts
class PingOperation extends Operation {
  get swaggerScopes(): OpenAPIV3.OAuth2SecurityScopes {
    return {};
  }
  handler(req: APIRequest, res: APIResponse) {
    res.json({ ok: true });
  }
}
```

No scope is registered, `operation.scopes` stays unset, no security validator is installed, no `security`
requirement appears in the document, and the operation always survives
`?filter=authorized`. [`SchemaResource`](schemas.md#schemaresource) does exactly this.

Note that a public operation whose resource is otherwise protected still contributes nothing to the resource
scope, so granting `Person` does not imply anything about it — there is nothing to grant.

## Filtering the document

[`filterAuthorizedDocument`](api.md#filterauthorizeddocument) removes from a copy of the document every
operation the caller can't perform, then paths left empty, tags whose last operation is gone, and unreferenced
components.

| Request | Response |
|---|---|
| `GET /openapi.json` | the whole API, unchanged |
| `GET /openapi.json?filter=authorized` | only what the caller can reach, plus `Cache-Control: no-store` |
| `GET /openapi.json?filter=<anything else>` | `400 Unsupported filter` |

Kept deliberately: `components.securitySchemes` including the scope map — knowing which scopes exist is what
lets a client ask for a better token — and any path or tag arrest doesn't serve, since arrest has no basis for
deciding whether the caller can reach something it didn't put there.

Add a filter of your own by overriding [`filterDocument`](api.md#filterdocument):

```ts
class MyAPI extends API {
  protected filterDocument(doc: OpenAPIV3.Document, filter: string, req: APIRequest): OpenAPIV3.Document | undefined {
    if (filter === 'public') {
      // what an anonymous caller would see: no credential at all, so only public operations survive
      const anonymous: APIRequest = Object.assign(Object.create(req), { scopes: undefined, ability: undefined });
      return this.filterAuthorizedDocument(doc, anonymous);
    }
    return super.filterDocument(doc, filter, req);
  }
}
```

Returning `undefined` for an unrecognized name is what produces the `400`; call `super` last so `authorized`
keeps working.

## MCP

The MCP server filters the same way: [`tools/list`](mcp.md#toolslist) omits tools whose operation answers
`false` to `isAuthorized`, and the [catalogue](mcp.md#mcpcatalogueoperation) omits bundles with no reachable
tool. A `tools/call` on an unlisted tool is still refused by the operation's own security validator — the
filtering is there so a model isn't offered tools it can't use, not as the enforcement point.

---

[← Schemas](schemas.md) · [Reference index](README.md) · [MCP →](mcp.md)
