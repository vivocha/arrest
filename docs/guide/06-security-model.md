# The security model

arrest separates two questions that are often muddled:

**Who is this caller?** — yours. arrest never authenticates. You attach a credential in
[`initSecurity`](../reference/api.md#initsecurity) from a JWT, a session, a gateway header, an API key, whatever
you use.

**What may this caller do?** — arrest's. It decides per operation, from one method, and it decides the same way
everywhere the question comes up.

## One decision, three places it surfaces

```
initSecurity                 you set req.scopes and/or req.ability
      │
      ▼
Operation.getAuthorizationError(req)   →  RESTError | undefined
      │
      ├─ securityValidator             enforce on a real request       → 401 / 403
      ├─ isAuthorized                  report without dispatching      → MCP tools/list, MCP catalogue
      └─ filterAuthorizedDocument      report over the whole document  → openapi.json?filter=authorized
```

This is the single most important structural fact about authorization in arrest. There is no separate
implementation for "can this caller see this in the document" or "should this tool be advertised": all three
paths call the same method, so **the API cannot advertise an endpoint it would then refuse**, and it cannot
refuse one it advertised.

The practical consequence: to add a requirement of your own — a bearer token you verify yourself, a tenant
check, a feature flag — override that one method and all three stay consistent for free.

```ts
class TenantOperation extends QueryMongoOperation {
  protected getAuthorizationError(req: APIRequest): RESTError | undefined {
    const err = super.getAuthorizationError(req);
    if (err) return err;
    return req.headers['x-tenant'] ? undefined : API.newError(403, 'no tenant');
  }
}
```

Now the operation is refused, absent from a filtered document, and absent from `tools/list`, for a caller with no
tenant header. Overriding `securityValidator` instead would have got you only the first.

## 401 versus 403

| Code | Means | When |
|---|---|---|
| `401` | "you have no credential" | neither `req.scopes` nor `req.ability` is set, and the operation needs one |
| `403` | "your credential isn't enough" | a credential exists but doesn't grant this operation |

The distinction is behavioural, not cosmetic: a `401` tells a client to go authenticate, a `403` tells it not to
bother because retrying with the same credential will fail identically. Clients that conflate them either retry
forever or give up too early.

Which is why `initSecurity` should **pass no credential rather than raise an error** when there is no credential:

```ts
initSecurity(req: APIRequest, res: APIResponse, next: NextFunction): void {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) {
    return next();                       // anonymous — public operations still work
  }
  try {
    req.scopes = new Scopes(verify(token).scope);
    next();
  } catch (err) {
    next(API.newError(401, 'invalid token'));   // a *bad* credential is a 401 here
  }
}
```

Rejecting anonymous requests in `initSecurity` makes every public operation — including `openapi.json` and
`/schemas/:id` — unreachable, which is usually not what you want. Let each operation decide.

The default `initSecurity` sets `req.scopes = new Scopes('*')` and logs a warning. That is deliberately loud: an
API with no `initSecurity` override grants everything, and you should see it in the log.

## Scopes: what a caller may do

A scope is `category.operation`. arrest generates one per operation, named after its `operationId`, plus one per
resource named after the resource:

| Scope | Grants |
|---|---|
| `Person.read` | reading one person |
| `Person` | every operation on `Person` (i.e. `Person.*`) |
| `*` | everything |
| `* -Person.remove` | everything except removing people |

Matching prefers the most specific rule, which is what makes that last line work. Details and the `Scopes` API
are in [reference/authorization.md](../reference/authorization.md#scopes).

**Enforcement does not wait for a security scheme.** `operation.scopes` is built from
[`swaggerScopes`](../reference/operation.md#swaggerscopes) alone, so every operation is guarded from the start
and answers `401 no scope` to a request `initSecurity` left without credentials — with or without a scheme in
the document. What the scheme adds is *description*: the `scopes: {}` map naming every scope the API
understands, and a `security` requirement on each operation. Declare it, because a client that can't discover
the scope names can't ask for a usable token:

```ts
const api = new API({ title: 'People', version: '1.0.0' });

api.document.components!.securitySchemes = {
  oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: '/token', scopes: {} } } },
};
```

Set it on the document, not in the constructor — the constructor argument is merged under `info`, so a
`components` key there goes nowhere. And set it **before adding resources**: each operation reads it while
attaching to build its own `security` entry, and one declared afterwards gets the scope map but no `security`
requirements. The `scopes: {}` map is filled in for you.

The reason an unsecured API still appears to let everything through is the *default* `initSecurity`, which
grants `*` and warns about it — not a missing scheme.

To make one operation public in an otherwise protected API, give it an empty
[`swaggerScopes`](../reference/operation.md#swaggerscopes). That is exactly what
[`SchemaResource`](../reference/schemas.md#schemaresource) does.

## Abilities: what a caller may do, to which records, to which fields

A [CASL](https://casl.js.org) ability on `req.ability` answers three questions at once. arrest maps its
vocabulary directly onto CASL's: **scope category = CASL subject, scope operation = CASL action**. So
`can('read', 'Person')` satisfies the `Person.read` scope.

```ts
req.ability = defineAbility((can, cannot) => {
  if (user.role === 'admin') {
    can('manage', 'all');
  } else {
    can(['read', 'query'], 'Person', ['name', 'surname', 'email'], { owner: user.id });
    can('update', 'Person', ['email'], { owner: user.id });
    cannot('remove', 'Person');
  }
}) as Ability;
```

That single declaration produces three different enforcement mechanisms:

| CASL feature | arrest turns it into |
|---|---|
| action + subject | whether the operation runs at all |
| **fields** — `['name', 'surname', 'email']` | which properties survive in responses and are accepted in bodies |
| **conditions** — `{ owner: user.id }` | a MongoDB filter merged into every query |

When both `req.ability` and `req.scopes` are set, **the ability wins** — `getAuthorizationError` checks the
ability and never looks at the scopes. Set one or the other, not both, unless you have a reason.

## Record-level: forbidden records are never read

CASL conditions become part of the query via
[`toMongoQuery`](../reference/utilities.md#tomongoquery), merged into `job.query` by
`MongoOperation.prepareQuery`. So `can('read', 'Person', { owner: 'u1' })` turns `GET /people/xyz` into a query
for `{ _id: xyz, owner: 'u1' }`.

Someone else's record therefore answers **404, not 403**. That is the intended behaviour: a `403` would confirm
the record exists, which is itself information. An enumeration attack against `/people/:id` learns nothing.

Two things follow, and they bite:

- **`Results-Matching` already accounts for record constraints** (the query was constrained) but not for field
  redaction emptying records — so the header can exceed the number of items in the body.
- **An override of `prepareQuery` that doesn't call `super` silently drops the constraints.** Always merge:

  ```ts
  protected async prepareQuery(job: MongoJob): Promise<MongoJob> {
    await super.prepareQuery(job);                                   // ability constraints + q
    job.query = addConstraint(job.query, { archived: { $ne: true } });
    return job;
  }
  ```

  Assigning to `job.query` instead of using [`addConstraint`](../reference/utilities.md#addconstraint) has the
  same effect: the constraint you didn't mean to remove is gone, silently, and the tests still pass because they
  run as an admin.

## Field-level redaction

CASL's `fields` become properties. On the way **out**, in
[`redactResult`](../reference/pipeline.md#redactresult), forbidden fields are deleted. On the way **in**, in
`prepareDoc`, they are rejected:

| Direction | Where | Behaviour |
|---|---|---|
| response | `redactResult` | **filters** — forbidden fields deleted silently |
| `POST` body | `CreateMongoOperation.prepareDoc` | **throws 403** on the first forbidden field |
| `PUT` body | `UpdateMongoOperation.prepareDoc` | **throws 403** — same |
| `PATCH` paths | `PatchMongoOperation.prepareQuery` | **throws 403**, with the offending op as `info` |

The asymmetry is between the two *directions*, not between the write methods: a response is filtered because
there is no one to tell, while a request that asks for something it may not have is refused. No write path drops
a field quietly, so a client is never left believing it wrote a value that was discarded.

Redaction runs **only when `req.ability` is set**. With scopes there is nothing to redact: either the operation
was permitted or it wasn't. If you need field-level control, you need abilities.

The mechanics of the walk — how paths are built, how arrays are handled, what counts as a leaf — are in
[reference/authorization.md](../reference/authorization.md#checkability).

## What a caller can discover

Two ways to ask "what may I do?", both derived from the same decision:

```
GET /openapi.json?filter=authorized       → the document, minus what you'd be refused
POST /mcp  { "method": "tools/list" }     → the tools, minus the ones you'd be refused
```

Neither is an enforcement point — a caller that guesses a hidden path still hits the security validator — and
that separation is what makes them safe to expose. They exist so a client (or a language model) isn't offered
things that will fail.

`?filter=authorized` keeps `components.securitySchemes`, including the scope map, on purpose: knowing which
scopes exist is what lets a client ask for a better token. See
[the document guide](04-openapi-document.md#filtering-by-authorization).

## Putting it together

A realistic shape:

```ts
class MyAPI extends API {
  initSecurity(req: APIRequest, res: APIResponse, next: NextFunction): void {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return next();

    let claims: Claims;
    try {
      claims = verify(token);
    } catch (err) {
      return next(API.newError(401, 'invalid token', undefined, err));
    }

    req.ability = defineAbility((can, cannot) => {
      if (claims.role === 'admin') {
        can('manage', 'all');
      } else {
        can(['read', 'query'], 'Person', { tenant: claims.tenant });
        can(['create', 'update'], 'Person', ['name', 'email'], { tenant: claims.tenant });
        cannot('remove', 'Person');
      }
    }) as Ability;

    next();
  }
}
```

From those nine lines a non-admin caller gets: `DELETE` refused with a `403`; queries and reads confined to its
own tenant, with other tenants' records reported as `404`; `POST` and `PUT` accepting only `name` and `email`;
an `openapi.json?filter=authorized` with no `DELETE` in it; and an MCP `tools/list` with no delete tool. No
per-endpoint checks anywhere.

Where to go next: [reference/authorization.md](../reference/authorization.md) for the full mechanics, or tutorial
chapters [11](../tutorial/11-scopes.md) and [12](../tutorial/12-abilities.md) to build this up step by step.

---

[← Schemas](05-schemas.md) · [Manual index](../README.md) · [Express integration →](07-express-integration.md)
