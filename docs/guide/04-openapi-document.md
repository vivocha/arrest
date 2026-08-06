# The OpenAPI document

The document isn't generated *from* your API — it **is** your API. This page is about how it gets assembled,
what it looks like when served, and how to inspect or filter it.

## It starts as `DEFAULT_DOCUMENT`

```ts
const api = new API({ title: 'People', version: '1.0.0' });
```

`api.document` is now a deep clone of
[`DEFAULT_DOCUMENT`](../reference/defaults.md#default_document) deep-extended with your `info`: OpenAPI
`3.1.0`, the JSON Schema 2020-12 dialect, three reusable schemas, two reusable responses, nine reusable
parameters, and an empty `paths`.

`version` must be valid [semver](https://semver.org) — the constructor throws `Invalid version` otherwise —
because [`attach`](../reference/api.md#attach) mounts the API at `/v<major>`.

The constructor takes an `InfoObject` and **only** that: it merges what you pass under `info`, so a `components`
key in the constructor argument becomes `document.info.components`, which is meaningless and silently ignored.
Everything outside `info` you set on the document directly:

```ts
const api = new API({ title: 'People', version: '1.0.0' });

api.document.components!.securitySchemes = {
  oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: '/token', scopes: {} } } },
};
```

Security schemes in particular must be in place **before any resource is added**, since operations read them
when they attach — see [architecture](03-architecture.md#1-construction). The `!` is because `components` is
optional in the type; `DEFAULT_DOCUMENT` always provides it.

## Resources and operations write themselves in

`addResource` → `resource.attach(api)` → `op.attach(api)`, and along the way:

| Call | Writes |
|---|---|
| [`registerTag`](../reference/api.md#registertag) | one `tags` entry per resource, with `x-id`, `x-title`, `x-summary-fields` from its definition |
| [`registerOauth2Scope`](../reference/api.md#registeroauth2scope) | the resource's scope, then each operation's, into **every** OAuth2 flow's `scopes` map |
| [`registerOperation`](../reference/api.md#registeroperation) | `paths[documentPath][method] = op.info` |

`registerOperation` returns a getter, which the operation installs as its own `info` property — so after attach,
`op.info` and the document are the same object. Changing one changes the other.

An operation's `info` comes from
[`getInfo`](../reference/operation.md#building-the-openapi-definition), a deep-extend of `getDefaultInfo` (what
the operation class provides) and `getCustomInfo` (what your subclass adds). The default supplies the
`operationId`, the resource's tag, and the `default` error response; everything else is yours.

**The deep-extend merges arrays by index**, which surprises people exactly once. If the parent contributes
`parameters: [a, b]` and you return `parameters: [c]`, the result is `[c, b]` — `c` merged over `a`. To add a
parameter without touching the inherited ones, spread them:

```ts
protected getCustomInfo(): OpenAPIV3.OperationObject {
  return {
    parameters: [...(super.getCustomInfo().parameters || []), { name: 'tenant', in: 'query', schema: { type: 'string' } }],
  };
}
```

Or, for the Mongo operations whose parameters come from `getDefaultInfo`, append in the constructor after
`super()` returns.

## Then `router()` transforms it

The five document steps of [`router()`](../reference/api.md#router), in order:

### Dynamic schemas are resolved

Anything registered with [`registerDynamicSchema`](../reference/api.md#registerdynamicschema) has its `spec()`
awaited and the result registered as an ordinary schema. This is the hook for a schema that isn't known until
startup — read from a database, assembled from a config file, fetched from another service. It happens once, at
startup, not per request.

### `definitions` are hoisted

JSON Schema files carry their reusable subschemas in `definitions`; OpenAPI wants them in
`components.schemas`. [`rebaseOASDefinitions`](../reference/schemas.md#rebaseoasdefinitions) walks the document,
lifts every nested `definitions` entry to `components.schemas` under an underscore-joined name, and rewrites the
`$ref`s to match:

```
components.schemas.person.definitions.address   →   components.schemas.person_address
{ $ref: '#/components/schemas/person/definitions/address' }  →  { $ref: '#/components/schemas/person_address' }
```

So you write a schema file the JSON Schema way and it lands in the document the OpenAPI way. See
[schemas](05-schemas.md).

### Unused components are pruned

[`removeUnusedSchemas`](../reference/schemas.md#removeunusedschemas) counts `$ref`s and deletes the
`components.schemas` and `components.parameters` nothing points at — so a registered schema you ended up not
using doesn't ship, and neither do the seven query parameters of an API with no query operations.

Two details: **responses are counted but never deleted**, so `defaultError` and `notFound` always survive; and a
`$ref` pointing at something absent **throws**, at startup, loudly. That is the check that catches a typo in a
`$ref` before a client does.

### The document is snapshotted

```ts
const originalDocument = (this.originalDocument = _.cloneDeep(this.document));
```

This snapshot is what `GET /openapi.json` serves, and what the [MCP layer](../reference/mcp.md) derives tool
schemas from. It exists because of what happens next.

### `$ref`s are resolved

```ts
this.document = await parse(this.document, this.parseOptions);
```

[jsonref](https://github.com/vivocha/jsonref) replaces every `$ref` with a **live proxy** to its target. The
document becomes convenient to use — a validator can follow a schema without resolving anything — and impossible
to serialize: recursive schemas are now circular, and `JSON.stringify` throws.

Hence the rule: **to read the document programmatically, use
[`getOriginalDocument()`](../reference/api.md#getoriginaldocument), not `api.document`.** After `router()`,
`api.document` is the resolved form, for validation. `getOriginalDocument()` is the serializable one.

External `$ref`s — `http://` or `https://` — are fetched here, by
[`defaultSchemaRetriever`](../reference/api.md#logging), which is an override point if your schemas live
somewhere that needs a credential.

## Serving it

```
GET /openapi.json
```

Registered by `router()` itself, so it is available wherever you mount the router, and it needs no scope. What
it does per request:

1. **requires a `Host` header** — without one there is no base URL to advertise, and it answers `400`;
2. clones the snapshot;
3. applies `?filter=` if present (below);
4. sets `servers` to `<x-forwarded-proto || protocol>://<host><baseUrl>`;
5. rewrites OAuth2 `authorizationUrl`, `tokenUrl` and `refreshUrl` as absolute URLs against that base;
6. sets `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET`.

Steps 4 and 5 are what makes the document work behind a proxy: declare `tokenUrl: '/token'` in your security
scheme and a caller reaching `https://api.example.com/v15` is told
`https://api.example.com/v15/token`. `x-forwarded-proto` is honoured so TLS terminated at the proxy doesn't
advertise `http:`. The CORS headers are there so a Swagger UI on another origin can load it.

Note that `servers` is *replaced*, not merged. Any `servers` you set on the document is overwritten per request.

## Filtering by authorization

`GET /openapi.json` describes the whole API to everyone, including operations a given caller would be refused.
Add `?filter=authorized` and it instead describes only what that caller can reach:

| Request | Response |
|---|---|
| `GET /openapi.json` | the whole API, unchanged |
| `GET /openapi.json?filter=authorized` | only what the caller can reach, plus `Cache-Control: no-store` |
| `GET /openapi.json?filter=<anything else>` | `400 Unsupported filter` |

Opt-in per request, so the default response stays what every existing consumer expects, and an unrecognized
value fails loudly rather than silently returning the full document.

Removed: every `paths[<path>][<method>]` whose operation answers `false` to
[`isAuthorized(req)`](../reference/operation.md#isauthorized); then paths left with no operation; tags whose last
operation is gone; and the `components.schemas` and `components.parameters` nothing refers to any more.
Public operations — those whose `swaggerScopes` is empty — are reachable by everyone and always survive.

Kept deliberately:

- **`components.securitySchemes`**, including the OAuth2 `flows[*].scopes` map. Knowing which scopes exist is
  what lets a client ask for a better token.
- **Paths and tags arrest does not serve.** A path entry with no operation behind it, or a tag no operation
  references, can only have been added to `api.document` by hand: arrest has no basis on which to decide whether
  the caller can reach it, so it stays. Only what the filter itself emptied is removed.

The decision is not a separate implementation: it is
[`Operation.getAuthorizationError`](../reference/operation.md#getauthorizationerror), the same method
`securityValidator` enforces on a real request — so the filtered document cannot advertise an endpoint the API
would then refuse. An operation that authorizes on something of its own overrides that one method and is
filtered correctly here too. This is the same property that makes MCP's
[`tools/list`](../reference/mcp.md#toolslist) trustworthy; see [the security model](06-security-model.md).

To add a filter of your own, override
[`filterDocument`](../reference/api.md#filterdocument) and return `undefined` for anything you don't recognize:

```ts
class MyAPI extends API {
  protected filterDocument(doc: OpenAPIV3.Document, filter: string, req: APIRequest): OpenAPIV3.Document | undefined {
    if (filter === 'public') {
      // what an anonymous caller would see: no credential at all, so only the public operations survive
      const anonymous: APIRequest = Object.assign(Object.create(req), { scopes: undefined, ability: undefined });
      return this.filterAuthorizedDocument(doc, anonymous);
    }
    return super.filterDocument(doc, filter, req);
  }
}
```

Returning `undefined` is what produces the `400`. Note `filterAuthorizedDocument` **mutates** the document it is
given — which is fine, since `openapi.json` hands it a clone.

## Inspecting it yourself

```ts
const api = new API({ title: 'People', version: '1.0.0' });
api.addResource(/* … */);
await api.router();

const doc = api.getOriginalDocument()!;
console.log(Object.keys(doc.paths));
await writeFile('openapi.json', JSON.stringify(doc, null, 2));
```

`await api.router()` is what makes the snapshot exist — before it, `getOriginalDocument()` is `undefined`. This
is how you commit the document to your repository, feed it to a client generator, or diff it in CI to catch an
accidental contract change. Note that `servers` is absent, since that is per request.

---

[← Architecture](03-architecture.md) · [Manual index](../README.md) · [Schemas →](05-schemas.md)
