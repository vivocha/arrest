# 11 — Authorization with scopes

**Goal:** decide who may call what, and understand that every operation has been enforcing a scope since chapter
03 — you just hadn't noticed.

## The surprise first

Run chapter 03 again, with logging on:

```bash
$ DEBUG=arrest* node dist/main.js 03
$ curl -s localhost:3000/people > /dev/null
```

```
arrest:warn #1 using default security validator
arrest:warn #1 scopes not set, setting default to *
```

Two warnings, on every request — and invisible without `DEBUG=arrest*`, which is why you hadn't noticed.
`GET /people` was never open: `QueryMongoOperation` carries a scope named
`Person.query` and a security validator that checks it. What made the request succeed is [`API.initSecurity`](../reference/api.md#initsecurity),
whose default implementation grants `*` and complains about it in the log.

So securing an arrest API is not a matter of *adding* enforcement. The enforcement is there. It is a matter of
replacing that default with something that reads a real credential.

## The code

[examples/tutorial/src/steps/11-scopes.ts](../../examples/tutorial/src/steps/11-scopes.ts):

```ts
class ScopedAPI extends API {
  initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction): void {
    const granted = typeof req.query.scope === 'string' ? req.query.scope.split(',').filter((s) => !!s.trim()) : [];
    if (!granted.length) {
      return next();                       // req.scopes stays undefined → the operations answer 401
    }
    try {
      req.scopes = new Scopes(granted);
      next();
    } catch (err) {
      next(API.newError(401, 'invalid scope'));
    }
  }
}
```

`?scope=…` in the query string stands in for a token, so the chapter can be explored with curl. A real
implementation verifies a bearer token and turns its claims into scopes, but the contract is exactly this one:
**set `req.scopes`, call `next`**.

And the security scheme, which has to be on the document **before** `addResource`:

```ts
api.document.components!.securitySchemes = {
  oauth2: {
    type: 'oauth2',
    flows: {
      clientCredentials: {
        tokenUrl: 'https://example.com/oauth2/token',
        scopes: {},                        // filled in by arrest as resources and operations register theirs
      },
    },
  },
};
```

## Run it

```bash
node dist/main.js 11
```

```bash
$ curl -si localhost:3000/people | head -1
HTTP/1.1 401 Unauthorized
$ curl -s localhost:3000/people
{"error":401,"message":"no scope"}

$ curl -s 'localhost:3000/people?scope=Person.remove'
{"error":403,"message":"insufficient privileges"}

$ curl -s 'localhost:3000/people?scope=Person.query' | head -c 40
[{"_id":"6a7440b3…","name":"Ada Lovelace"
```

Three outcomes, and the difference between the first two is the whole point.

## What just happened

### 401 is not 403

| Situation | Status | Body |
|---|---|---|
| `req.scopes` and `req.ability` both unset | **401** | `{"error":401,"message":"no scope"}` |
| set, but doesn't cover this operation | **403** | `{"error":403,"message":"insufficient privileges"}` |

401 means *I don't know who you are* — go get a credential. 403 means *I do, and this one isn't enough* — getting
another of the same kind won't help. Clients act on the difference: a 401 triggers a token refresh, a 403 should
not.

Both come from one method, [`getAuthorizationError`](../reference/operation.md#getauthorizationerror), and that
is the point of it being one method: `securityValidator` enforces it on a real request, `isAuthorized` reports it
without dispatching anything, and `filterAuthorizedDocument` uses it to filter the document. Add a requirement by
overriding that method and all three agree by construction.

Note what arrest does *not* send: there is no `WWW-Authenticate` header on the 401. If your clients need one, set
it in an error handler.

### The scope grammar

A scope is `category.operation`. arrest generates one per operation named after its `operationId`, and
[`Resource.attach`](../reference/resource.md#attach) adds one per resource named after `info.name`. All measured
against `GET /people` (needs `Person.query`) and `DELETE /people/{id}` (needs `Person.remove`):

| `?scope=` | `GET /people` | `DELETE /people/{id}` |
|---|---|---|
| `*` | 200 | allowed |
| `Person` | 200 | allowed |
| `Person.*` | 200 | allowed |
| `Person.query` | 200 | **403** |
| `Person,-Person.remove` | 200 | **403** |
| `*,-Person` | **403** | **403** |
| `nonsense` | **403** | **403** |

The rules behind that table:

- a bare category means `category.*` — `Person` grants every `Person.*` operation;
- **the negation prefix is `-`**, and `+` affirms. `-Person.remove` alongside `Person` subtracts exactly one
  operation;
- matching prefers the most specific entry: `Person.remove` beats `Person.*` beats `*.remove` beats `*.*`, which
  is what makes subtraction work regardless of order — `-Person.remove,Person` behaves identically to
  `Person,-Person.remove`;
- order within the string is irrelevant. A `Scopes` is a map, not a list:

  ```
  new Scopes(['Person', '-Person.remove'])  →  {"Person":{"*":true,"remove":false}}
  ```

The trap is that **anything unrecognizable is a category name, not an error**:

```
new Scopes(['!Person.remove'])  →  {"!Person":{"remove":true}}
```

`!` is not the negation prefix. `!Person.remove` parses cleanly as a category literally called `!Person`, which
grants nothing and denies nothing — so a rule you *meant* as a denial silently doesn't apply, and the DELETE
succeeds. There is no warning. If you build scope strings programmatically, test them.

### Parse failures are 401s, and you have to catch them

`Scopes` throws a `RangeError` on a token with an empty half — `''`, `'Person.'`, `'.read'` — and the message is
empty, so it tells you nothing:

```ts
new Scopes(['']);        // RangeError: ""
```

An uncaught throw in `initSecurity` reaches [`handleError`](../reference/api.md#handleerror) as an unknown error
and the caller gets a **500**, which is wrong twice over: the fault is in the request, and the status invites a
retry. Hence the `try`/`catch`, and the `filter` that drops empty pieces so `?scope=` and a trailing comma behave
like no scope at all:

```bash
$ curl -s 'localhost:3000/people?scope='               # nothing but separators
{"error":401,"message":"no scope"}

$ curl -s 'localhost:3000/people?scope=Person.'        # unparseable
{"error":401,"message":"invalid scope"}
```

**Never hand untrusted text to the `Scopes` constructor bare.** This applies to token claims as much as to a
query parameter.

### The scheme is documentation; the enforcement is separate

This is worth being precise about, because the two look coupled and aren't. `Operation.attach` does two
independent things:

- it builds `this.scopes` from [`swaggerScopes`](../reference/operation.md#swaggerscopes) — **always**, whether or
  not a security scheme exists;
- it adds a `security` requirement to the operation's document entry — only for schemes already on the document.

Measured on an API with **no** `securitySchemes` at all:

| `initSecurity` | `GET /people` |
|---|---|
| the default (grants `*`) | 200 |
| sets nothing | **401 `no scope`** |
| grants `Other.read` | **403** |

So chapters 03–10 were enforcing scopes all along. What declaring the scheme buys you is the *description*: the
`scopes` map naming everything the API understands, and a per-operation `security` entry.

```bash
$ curl -s localhost:3000/openapi.json | jq '.components.securitySchemes.oauth2.flows.clientCredentials.scopes'
{
  "Person": "Unrestricted access to all People",
  "Person.statistics": "Count people by country",
  "Person.query": "Retrieve a list of People",
  "Person.create": "Create a new Person",
  "Person.read": "Retrieve a Person by id",
  "Person.update": "Update a Person",
  "Person.remove": "Delete a Person by id",
  "Person.patch": "Patch a Person",
  "Schema": "Unrestricted access to all Schemas"
}

$ curl -s localhost:3000/openapi.json | jq '.paths."/people".get.security'
[{"oauth2": ["Person.query"]}]
```

Nine entries you never wrote. The descriptions come from each operation's `summary` — `Person.statistics` reads
`Count people by country`, which is chapter 08's summary — falling back to `Execute <operationId> on a <Name>`
when there is none, and the resource-wide one comes from
[`scopeDescription`](../reference/resource.md#scopedescription). Chapter 09 overrode that; this is where it shows
up.

Declaring the scheme **after** `addResource` half-works, which is the failure to watch for: the scope map still
fills in, but the operations attached earlier have no `security` in the document. The API is enforced and the
document doesn't say so.

### Which operations are already public

```bash
$ curl -si localhost:3000/schemas/person | head -1
HTTP/1.1 200 OK                                # no ?scope= at all
```

[`SchemaResource`](../reference/schemas.md#schemaresource) is the exception, and the mechanism is the one to copy:

```ts
get swaggerScopes(): OpenAPIV3.OAuth2SecurityScopes {
  return {};                                   // ReadSchemaOperation
}
```

Empty `swaggerScopes` → no scope names → `this.scopes` never set → `useSecurityValidator()` is false, no
middleware installed, and `getAuthorizationError` returns `undefined` for want of anything to check. That is the
only way to make an operation public, and it is deliberately explicit. Its document entry shows the difference:

```bash
$ curl -s localhost:3000/openapi.json | jq '.paths."/schemas/{id}".get.security'
[{"oauth2": []}]                               # a scheme applies, requiring no scopes
```

`GET /openapi.json` itself is not an operation at all — it is registered directly on the router before any
resource — so no scope applies to it either.

Note that the `Schema` scope *is* in the scope map, registered by `Resource.attach` from the resource name. It
grants nothing, because no operation requires it. A resource scope exists whether or not anything needs it.

### `?filter=authorized` from the client's side

Chapter 04's guide mentioned this; now it does something. The same `isAuthorized` decision, applied to the
document:

```bash
$ curl -s 'localhost:3000/openapi.json?filter=authorized&scope=Person.query' | jq -r '.paths | keys[]'
/people
/schemas/{id}

$ curl -s 'localhost:3000/openapi.json?filter=authorized&scope=Person,-Person.remove' | jq -r '.paths | keys[]'
/people
/people/statistics
/people/{id}                                   # get, patch, put — delete is gone
/schemas/{id}

$ curl -s 'localhost:3000/openapi.json?filter=authorized' | jq -r '.paths | keys[]'
/schemas/{id}                                  # no credential: only the public operation
```

Tags follow: with `Person.query` the response has `Person` and `Schema`; with no scope, only `Schema`. Paths left
with no operations go, and so do schemas nothing references any more.

```bash
$ curl -si 'localhost:3000/openapi.json?filter=authorized&scope=Person.query' | grep -i cache-control
Cache-Control: no-store

$ curl -s 'localhost:3000/openapi.json?filter=bogus'
{"error":400,"message":"Bad Request","info":"Unsupported filter, the only supported value is \"authorized\""}
```

The `no-store` is not decoration: the response depends on the caller's credential, and a shared cache that reused
one client's filtered document for another would leak the shape of your API. It is set only when a filter was
applied — the unfiltered document stays cacheable.

Two properties worth understanding before you rely on this:

- **it is not the enforcement point.** A path missing from the filtered document is still refused by the
  operation's own security validator if called. Filtering exists so a client is not shown what it cannot use;
- **paths arrest doesn't serve are left alone.** If you added a path to `document.paths` by hand, arrest has no
  operation to ask and keeps it. Same for tags it didn't register.

One rough edge, measured: schema pruning is a single pass, so a schema referenced *only* by another schema that
was itself pruned survives as an orphan.

```bash
$ curl -s 'localhost:3000/openapi.json?filter=authorized&scope=Person.statistics' | jq '.components.schemas | keys'
["errorResponse", "person_tag"]        # person is gone; person_tag, which only person referenced, is not
```

Harmless — an unreferenced definition — but don't be surprised by it, and don't treat the filtered document's
`components.schemas` as a minimal set.

### Designing scopes people can actually be granted

The generated set is fine-grained by construction, one scope per operation. That is the right default and the
wrong thing to put in a token: `Person.query,Person.read,Person.create,Person.update,Person.patch` is what
`Person` means. Some guidance from real use:

- **grant categories, not operations.** `Person` for a service that owns people, `Person.query,Person.read` for a
  reader. Reach for the specific form when you're subtracting: `Person,-Person.remove`;
- **name operations for the scope, not for the URL.** Chapter 08 passed an explicit id for exactly this reason —
  the path can be renamed, the scope in an issued token can't;
- **`*` is for tests.** It survives every future operation you add, including the destructive ones;
- **an operation that authorizes on something of its own** — a signed download link, a webhook secret — should
  override `getAuthorizationError` rather than check inside `handler`. Then `tools/list` and
  `?filter=authorized` tell the truth about it too.

## Exercises

1. Start the chapter-11 server and request `/people` with no scope, then with `Person`. Watch the log lines.
2. Grant `Person,-Person.query` and predict every one of the five CRUD responses before running them.
3. Make `GET /people/statistics` public by overriding `swaggerScopes`, and confirm it survives
   `?filter=authorized` with no credential.
4. Change `initSecurity` to read a `Bearer` header instead of `?scope=`, returning 401 for a malformed token.
5. Move the `securitySchemes` assignment after `addResource` and diff the two documents. What changed, and is the
   API still enforced?

---

[← Chapter 10](10-pipeline.md) · [Tutorial index](README.md) · [Chapter 12 →](12-abilities.md)
