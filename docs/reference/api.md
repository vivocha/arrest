# `API`

Source: [src/api.ts](../../src/api.ts)

The top-level container. An `API` owns an OpenAPI document, a list of resources, and the Express router
that serves them.

```ts
import { API } from 'arrest';

const api = new API({ title: 'My API', version: '1.0.0' });
```

## Constructor

```ts
constructor(info?: OpenAPIV3.InfoObject)
```

`info` is merged over the `info` object of [the default document](defaults.md), so `title` defaults to
`REST API` and `version` to `1.0.0`.

**Throws** `Error('Invalid version')` when `info.version` is not a valid semver string. The version matters
beyond documentation: [`attach`](#attach) mounts the API at `/v<major>`.

## Properties

| Property | Type | Description |
|---|---|---|
| `document` | `OpenAPIV3.Document` | The document under construction. Write to it directly for anything arrest doesn't model — `servers`, `security`, `externalDocs`. After [`router()`](#router) has run this holds the *resolved* document, whose `$ref`s are live proxies. |
| `originalSchemas` | `{ [name: string]: OpenAPIV3.SchemaObject }` | Every schema passed to [`registerSchema`](#registerschema), as given, before rebasing. This is what [`SchemaResource`](schemas.md#schemaresource) serves. |
| `resources` | `Resource[]` | `protected`. Use [`getResources`](#getresources). |
| `parseOptions` | `ParseOptions` | `protected`. jsonref options: `scope` (default `http://vivocha.com/api/v3`) and `retriever`. Override in a subclass to resolve external `$ref`s your own way. |

## Resources

### `addResource`

```ts
addResource(resource: Resource): this
```

Adds a resource and calls its [`attach`](resource.md#attach), which registers its tag, its OAuth2 scope and
all of its operations into the document. Order matters for route matching — see
[Express integration](../guide/07-express-integration.md#route-order).

### `getResources`

```ts
getResources(): Resource[]
```

A copy of the resource list.

## Schemas

### `registerSchema`

```ts
registerSchema(name: string, schema: OpenAPIV3.SchemaObject): void
```

Stores `schema` under `components.schemas[name]`, rebasing its `$ref`s (see
[schemas.md](schemas.md#ref-rebasing)) and stripping `$schema`. The unmodified original is kept in
`originalSchemas`.

### `registerDynamicSchema`

```ts
registerDynamicSchema(name: string, schema: SchemaObject): void
```

Registers an openapi-police `SchemaObject` whose definition is computed asynchronously. Its `spec()` is
awaited inside [`router()`](#router) and the result passed to `registerSchema`. Use when a schema depends on
something you can't read synchronously at construction time.

## Document assembly

### `registerOperation`

```ts
registerOperation(path: string, method: string, operation: OpenAPIV3.OperationObject): () => OpenAPIV3.OperationObject
```

Writes `operation` into `paths[path][method]`, stripping a trailing slash from `path`, and returns a getter
for the stored object. [`Operation.attach`](operation.md#attach) uses that getter to redefine its own `info`
property, so an operation always reads back what the document actually holds — including changes made by the
parse step.

Called for you by `Operation.attach`; call it yourself only to add a path arrest doesn't serve.

### `registerTag`

```ts
registerTag(tag: OpenAPIV3.TagObject): void
```

Appends to `document.tags`.

### `registerOauth2Scope`

```ts
registerOauth2Scope(name: string, description: string): void
```

Adds a scope to every flow of every OAuth2 security scheme in `components.securitySchemes`. With no OAuth2
scheme declared this does nothing — the scope simply goes undocumented. It does **not** disable authorization:
[`Operation.attach`](operation.md#attach) sets `operation.scopes` from `swaggerScopes` regardless, so the
operations are still enforced.

### `getOauth2Schemes`

```ts
getOauth2Schemes(): OpenAPIV3.OAuth2SecurityScheme[]
```

### `getOriginalDocument`

```ts
getOriginalDocument(): OpenAPIV3.Document | undefined
```

A deep copy of the document taken inside [`router()`](#router), just before jsonref resolves it. Use this
whenever you need to *inspect or serialize* the document: after parsing, `$ref`s are live proxies and
recursive schemas are circular, so neither `JSON.stringify` nor a naive walk survives. This is what the MCP
layer derives tool schemas from.

Returns `undefined` before `router()` has run.

## Document filters

### `filterDocument`

```ts
protected filterDocument(doc: OpenAPIV3.Document, filter: string, req: APIRequest): OpenAPIV3.Document | undefined
```

**override point.** Applies the named `?filter=` value to a copy of the document. Returns `undefined` for an
unrecognized filter, which `GET /openapi.json` reports as `400`. The base implementation handles
`authorized` and nothing else; call `super.filterDocument` at the end of an override so you keep it.

### `filterAuthorizedDocument`

```ts
filterAuthorizedDocument(doc: OpenAPIV3.Document, req: APIRequest): OpenAPIV3.Document
```

Removes from `doc` every operation the caller of `req` may not perform, then everything left describing
nothing: emptied paths, tags whose last operation is gone, and unreferenced components. Modifies and returns
the document passed in.

The decision belongs to each operation — [`Operation.isAuthorized`](operation.md#isauthorized) — so a
filtered document can never advertise an endpoint the security validator would refuse. Full semantics in
[the guide](../guide/04-openapi-document.md#filtering-by-authorization).

### `documentTags`

```ts
protected documentTags(doc: OpenAPIV3.Document): Set<string>
```

The tags referenced by the operations of a document. Used to tell a tag emptied by a filter from a tag that
never had operations.

## Serving

### `router`

```ts
router(options?: RouterOptions): Promise<Router>
```

Builds the Express router, **memoized**: the first call does the work, every later call returns the same
promise and ignores `options`. In order, it:

1. installs a middleware attaching a per-request `logger` to `req`;
2. installs [`initSecurity`](#initsecurity) (or the deprecated `securityValidator`, if overridden);
3. resolves every dynamic schema and registers it;
4. adds a [`SchemaResource`](schemas.md#schemaresource) if any schema is registered;
5. moves nested `definitions` into `components.schemas` (`rebaseOASDefinitions`) and drops unreferenced
   components (`removeUnusedSchemas`);
6. snapshots the document into [`getOriginalDocument`](#getoriginaldocument);
7. registers `GET /openapi.json`;
8. resolves the document with jsonref, assigning the result to `document`;
9. builds each resource's router, in the order the resources were added;
10. installs [`handleError`](#handleerror) as the error middleware.

Everything from step 3 on happens once. Adding a resource after `router()` has been awaited has no effect on
the served routes.

### `attach`

```ts
attach(base: Router, options?: RouterOptions): Promise<Router>
```

Mounts this API's router on `base` at `/v<major version>` and returns `base`.

### `listen`

```ts
listen(httpPort: number, httpsPort?: number, httpsOptions?: https.ServerOptions): Promise<any>
```

Creates an Express app with this API's router plus [`handle404Error`](#handle404error-static), and starts the
requested servers. Returns the single server, or an array of `[https, http]` when both ports are given.

**Throws** when neither port is given, or when `httpsPort` is given without `httpsOptions`.

## Security

### `initSecurity`

```ts
initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction): void
```

**override point.** The first middleware of the router, and the place to authenticate a request: set
`req.scopes` (a `Scopes`) and/or `req.ability` (a CASL `Ability`) from whatever credential you accept.

The default implementation logs a warning and grants `req.scopes = new Scopes('*')` — every scope. That is a
convenience for development and **must** be replaced in anything exposed to real traffic.

Do not report an authentication failure yourself unless you mean to reject *every* operation: a missing
credential is fine for public operations, and each operation's own
[`getAuthorizationError`](operation.md#getauthorizationerror) decides whether one was needed. Pass an error
to `next` only when the credential is present but malformed.

### `securityValidator`

```ts
securityValidator(req: APIRequest, res: APIResponse, next: NextFunction): void
```

**Deprecated.** Delegates to `initSecurity`. If a subclass overrides it, `router()` installs the override
instead of `initSecurity` and logs a deprecation warning.

## Errors

### `handleError`

```ts
handleError(err: any, req: APIRequest, res: APIResponse, next?: NextFunction): void
```

**override point.** The router's error middleware, and the single place an error becomes a response:

| `err.name` | Response |
|---|---|
| `RESTError` | `err.code` with `{ error, message, info }` |
| `ValidationError` | `400` with `ValidationError.getInfo(err)` as `info` |
| anything else | `500 internal`, with the error and its stack logged |

Note it is passed to Express unbound, so `this` is not available inside it; a subclass that needs instance
state should bind in its own `router()` override or use an arrow property.

### `newError` / `fireError` (static)

```ts
static newError(code: number, message?: string, info?: any, err?: any): RESTError
static fireError(code: number, message?: string, info?: any, err?: any): never
```

Build, and build-and-throw, a [`RESTError`](errors.md).

### `handle404Error` (static)

```ts
static handle404Error(req: APIRequest, res: APIResponse, next: NextFunction): void
```

A terminal middleware answering `404`. [`listen`](#listen) installs it; when you mount the router yourself,
install it after all your other routes if you want the same behaviour.

## Logging

```ts
protected getDebugLabel(): string    // 'arrest'
protected getDebugContext(): string  // '#<n>', incrementing per request
protected async defaultSchemaRetriever(url: string): Promise<any>
```

**override points.** The label is the [debuggo](https://github.com/vivocha/debuggo) namespace, so overriding
it moves this API's logs under your own `DEBUG` selector. The retriever fetches external `$ref`s over HTTP
via `needle` and throws a `RESTError` on a non-200.

---

[← Reference index](README.md) · [Resource →](resource.md)
