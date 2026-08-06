# Architecture

Three classes, each owning one thing.

```
API          the document, the router, security setup, error reporting
 └─ Resource a base path, a tag, an OAuth2 scope, a set of operations
     └─ Operation  one path + one method: its description, validators, authorization, handler
```

Everything else in arrest is a subclass of one of these.
[`MongoResource`](../reference/mongo-resource.md) is a `Resource` that knows about a collection;
[`PipelineOperation`](../reference/pipeline.md) is an `Operation` with a lifecycle;
[`MCPResource`](../reference/mcp.md#mcpresource) is a `Resource` whose operations happen to speak JSON-RPC.

## Who owns what

### `API`

Owns [`document`](../reference/api.md#properties) — the OpenAPI document under construction — and every
document-level concern: registering schemas, tags and OAuth2 scopes; building the Express router;
attaching `req.logger`, `req.scopes` and `req.ability`; serving `openapi.json`; reporting errors that reach the
end of the chain.

One `API` is one document and one version. Two versions of an API are two `API` instances, mounted at different
paths.

### `Resource`

Owns a name and, from it, a **base path** and a **tag** and an **OAuth2 scope**. Its
[`info`](../reference/resource.md#resourcedefinition) is a `ResourceDefinition`, which becomes the tag object in
the document. It holds a list of operations and, in `router()`, mounts them all on a sub-router under its base
path.

A `Resource` is not a data model. It has no schema of its own, no fields and no persistence — those belong to
its operations, or to `MongoResource`, which adds a collection.

### `Operation`

Owns one `(path, method)` pair. Its `info` is the OpenAPI operation object, and from that everything else
follows: `parameters` become validators, `requestBody` becomes a parser and a validator, `security` becomes an
authorization check, `operationId` becomes the scope name. `handler` is the only abstract member.

This is the class you subclass most. In production code the ratio is roughly one custom operation per resource
per non-CRUD thing the resource does.

## Names and paths

Names drive everything, so it is worth knowing the derivation exactly.

```ts
new Resource({ name: 'Person', namePlural: 'People' });
```

| Derived thing | From | Value |
|---|---|---|
| base path | `namePlural`, decamelized with `-` | `/people` |
| tag name | `name` | `Person` |
| resource scope | `name` | `Person` |
| operation id | `name` + `internalId` | `Person.query` |
| operation scope | operation id | `Person.query` |

Without `namePlural`, arrest appends an `s`: `Person` → `Persons` → `/persons`. Always set `namePlural` unless
the naive plural is right. Without `name`, it is derived from the class name, which is why a
`class PeopleResource extends Resource` with no `info` becomes `PeopleResource` → `/people-resources` — set the
name.

`path` overrides the derivation entirely:

```ts
new Resource({ name: 'Health', path: 'health' }); // → /health
```

Decamelization is why `BlogPost`/`BlogPosts` becomes `/blog-posts` and not `/blogposts`.

An operation's own path is appended: `'/'` gives `/people`, `'/:id'` gives `/people/{id}` in the document and
`/people/:id` in Express. The `internalId` — the part after the dot in the operation id — is derived from path
and method: `'/'` + `get` → `query` for Mongo operations, and generally the path with a `-<method>` suffix for
anything other than `get`. See [`Operation`](../reference/operation.md#constructor).

## Startup: how the document gets built

Three phases, in this order. Nothing in phase 2 can be undone by phase 3.

### 1. Construction

```ts
const api = new API({ title: 'People', version: '1.0.0' });     // document = DEFAULT_DOCUMENT + info
api.addResource(new MongoResource(db, { name: 'Person', namePlural: 'People' }));
```

`addResource` calls `resource.attach(api)`, which registers the tag and the resource scope, then calls
`op.attach(api)` on each operation. That last call is where the operation's `info` is written into
`document.paths[documentPath][method]`, its scope registered, and its `security` array filled in from the
document's security schemes.

Two consequences of `attach` order:

- **Security schemes must exist before the resource is added.** Operations read
  `components.securitySchemes` in `attach` to build their `security` arrays, so assign
  `api.document.components!.securitySchemes` immediately after constructing the API — the constructor argument
  is merged under `info` and can't carry them. Adding a scheme later leaves every already-attached operation
  unsecured.
- **After `attach`, `op.info` is a live getter** into the document. Mutating `op.info` mutates the document,
  and mutating the document is visible through `op.info`. Intentional — it is how `MongoResource` adjusts
  operations after the fact — but it means you cannot copy an operation's info and expect it to stay put.

### 2. `router()`

One call, memoized, does all of this:

1. installs the logger middleware, then [`initSecurity`](../reference/api.md#initsecurity);
2. resolves [dynamic schemas](../reference/api.md#registerdynamicschema) by awaiting their `spec()`;
3. adds a [`SchemaResource`](../reference/schemas.md#schemaresource) if any schema is registered, so
   `GET /schemas/:id` serves them;
4. hoists nested `definitions` into `components.schemas`
   ([`rebaseOASDefinitions`](../reference/schemas.md#rebaseoasdefinitions));
5. deletes unreferenced schemas and parameters
   ([`removeUnusedSchemas`](../reference/schemas.md#removeunusedschemas));
6. **snapshots the document** — `originalDocument`, the unresolved form — and registers the `openapi.json`
   route over that snapshot;
7. resolves every `$ref` with [jsonref](https://github.com/vivocha/jsonref), replacing them with live proxies;
8. calls `resource.router()` on each resource, which builds the middleware chains;
9. installs [`handleError`](../reference/errors.md#handleerror) last.

Step 6 before step 7 is the important ordering. After parsing, the document contains proxies and circular
references and can't be serialized — so the snapshot taken before it is what `openapi.json` serves and what the
[MCP layer](../reference/mcp.md#input-and-output-schemas) derives tool schemas from. If you need the document
programmatically, use [`getOriginalDocument()`](../reference/api.md#getoriginaldocument), not `api.document`.

The whole thing is memoized on the first call: **later `router()` calls return the same promise**, resources
added afterwards are ignored, and a failure at startup is permanent for that instance. Add everything, then
serve.

### 3. Serving

```ts
await api.listen(3000);                    // its own express app, plus handle404Error
// or
app.use('/api', await api.router());       // inside your app
// or
await api.attach(baseRouter);              // mounted at /v<major> of info.version
```

See [Express integration](07-express-integration.md).

## A request's path

For `GET /people/5f8d0d55b54764421b7156c3?fields=name`:

```
API router
 │  logger middleware              → req.logger
 │  initSecurity                   → req.scopes / req.ability
 │
 ├─ Resource router, mounted at /people
 │   │
 │   ├─ Operation middleware chain, in this order:
 │   │    securityValidator        → 401 / 403, from getAuthorizationError
 │   │    header validators        (if the operation declares header parameters)
 │   │    cookieParser + cookie validators   (if it declares cookie parameters)
 │   │    path validators          → req.params.id validated and coerced
 │   │    query validators         → req.query.fields validated, defaults applied
 │   │    body parser + validator  (if it declares a requestBody)
 │   │    handler
 │   │    Operation.errorHandler   → next(err) by default
 │   │
 │   └─ r.all(path) → 405, for known paths whose method nothing handled
 │
 └─ API.handleError                → the response body for any error
```

Order matters in two places. **Authorization runs before validation**, so a caller without the scope gets a
`401`/`403` and learns nothing about whether its parameters were acceptable. And **the `405` fallback is
registered after every operation**, on every path a resource owns, so a `POST` to a path with only a `GET`
is a `405` rather than falling through to a `404`.

For a [`PipelineOperation`](../reference/pipeline.md), `handler` is itself a fixed sequence —
`createJob → prepareQuery → prepareDoc → prepareOpts → runOperation → redactResult → processResult` — which is
where the Mongo operations do their work, and where you hook in. Note it catches its own errors and calls
`api.handleError` directly, so `Operation.errorHandler` is not in that path.

## Where you intervene

Roughly in order of how often you'll do it, based on production usage:

| You want to | Do this |
|---|---|
| add parameters, responses, a body schema, a summary | override [`getCustomInfo`](../reference/operation.md#building-the-openapi-definition) |
| do the work of a custom operation | subclass `PipelineOperation`, implement [`runOperation`](../reference/pipeline.md#runoperation) |
| expose an operation as an MCP tool | give it [`mcpTool`](../reference/mcp.md#mcptool) |
| declare a schema once and `$ref` it | [`registerSchema`](../reference/api.md#registerschema) |
| hide or transform fields on the way out | override [`redactResult`](../reference/pipeline.md#redactresult) |
| constrain what a query can see | override [`prepareQuery`](../reference/pipeline.md#preparequery), merging with [`addConstraint`](../reference/utilities.md#addconstraint) |
| mix generated and hand-written routes | subclass `Resource`, merge into `MongoResource.defaultRoutes()` |
| decide who the caller is | override [`initSecurity`](../reference/api.md#initsecurity) |
| authorize on something other than scopes | override [`getAuthorizationError`](../reference/operation.md#getauthorizationerror) |
| change how errors are reported | override [`handleError`](../reference/errors.md#handleerror) |

Note what is *not* on that list: subclassing `MongoResource`. It is possible, but in practice the resource-level
knobs plus custom operations cover what you need — the extension you reach for is nearly always an operation.

---

[← Installation](02-installation.md) · [Manual index](../README.md) · [The OpenAPI document →](04-openapi-document.md)
