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
| **conditions** (`{ owner: … }`) | which records the query can reach — [record constraints](#record-level-constraints) |

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
  filterData?: boolean
): any
```

The engine behind [`Operation.checkAbility`](operation.md#checkability), which calls it once per
`(subject, action)` pair in the operation's scopes, threading `data` through.

**With no `data`**: a plain `throwUnlessCan(action, resource)` — throws CASL's `ForbiddenError`, returns
`undefined`.

**With `data`**, it walks the value recursively and checks each **leaf** against the ability using its dotted
path as the CASL field. Two flags decide what happens to a violation:

| `filterFields` | `filterData` | Behaviour |
|---|---|---|
| `false` | `false` | throw `403 insufficient privileges` on the first forbidden field |
| `true` | `false` | delete forbidden fields (and forbidden array elements) and return the rest |
| any | `true` | additionally drop whole records the ability's *conditions* reject, before walking fields |

The walk has a few properties worth knowing:

- `ObjectId`s and `Date`s are treated as scalars, not objects to descend into;
- for arrays, each element is checked with the **same path** — the index is not part of the field path, which
  is what lets `can('read', 'Person', ['tags'])` permit a whole array;
- in an array, a forbidden element is dropped (`filterFields`) rather than emptying the array;
- results are memoized per path for the duration of one call, so a wide array of uniform objects costs one
  check per distinct path;
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

Note the asymmetry between the two directions: a response is *filtered* silently, while a request body carrying
a field the ability forbids is *rejected*. Both write paths pass `filterFields: false`, so neither drops a field
quietly — a client that sends what it may not write gets told. Only `redactResult` filters, and only because a
response has no one to complain to.

Redaction only runs when `req.ability` is set. With scope-based authorization there is nothing to redact:
either the operation was permitted or it wasn't.

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
