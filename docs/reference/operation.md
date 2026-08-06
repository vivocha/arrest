# `Operation`

Source: [src/operation.ts](../../src/operation.ts)

An operation is one method on one path: its OpenAPI definition, its validators, its authorization rule and
its handler. `Operation` is abstract — subclasses implement [`handler`](#handler) — and it is the base of
everything arrest serves, including [`PipelineOperation`](pipeline.md), the
[Mongo operations](mongo-operations.md), [`JSONRPC`](rpc.md) and the [MCP endpoints](mcp.md).

## Constructor

```ts
constructor(resource: Resource, path: string, method: Method, id?: string, opts?: any)
```

| Parameter | Meaning |
|---|---|
| `resource` | The owning resource. Available as `this.resource` throughout |
| `path` | Express path *relative to the resource base path*: `/`, `/:id`, `/:id/history` |
| `method` | Lowercase HTTP method |
| `id` | The [`internalId`](#properties). Derived from `path` and `method` when omitted |
| `opts` | Passed to `getInfo`, and from there to `getDefaultInfo`/`getCustomInfo`. arrest never sets it; it's yours |

The derived `id`, when you don't supply one, is the path without its leading slash, suffixed with `-<method>`
for any method other than `get`, or just the method for the root path. So `('/','get')` → `get`,
`('/:id','put')` → `:id-put`. Since `internalId` ends up in `operationId`, in the MCP tool name and in the
`mcp.tools` keys, **pass an explicit `id`** for anything you'll refer to later.

**Throws** `Error('Required operationId missing')` if the assembled info has no `operationId` — which only
happens if an override drops it.

## Properties

| Property | Type | Description |
|---|---|---|
| `info` | `OpenAPIV3.OperationObject` | The operation's OpenAPI definition. After [`attach`](#attach) this is a **getter** onto the document, so it reflects the document's current state rather than a copy |
| `resource` | `Resource` | The owning resource |
| `api` | `API` | Set by `attach` |
| `internalId` | `string` | Identifier within the resource. Used in `operationId`, `mcp.tools` keys and MCP tool names |
| `scopes` | `Scopes` | Set by `attach` from [`swaggerScopes`](#swaggerscopes), and only when the API declares OAuth2 security schemes. **When it is unset there is no authorization check at all** |
| `path`, `method` | `string`, `Method` | As passed to the constructor |

### `swaggerPath` / `documentPath`

```ts
get swaggerPath(): string   // '/:id'      → '/{id}'
get documentPath(): string  // basePath + swaggerPath, trailing slash stripped
```

`documentPath` is the key this operation occupies in `document.paths`, and the value to use when looking
itself up in a document.

### `swaggerScopes`

```ts
get swaggerScopes(): OpenAPIV3.OAuth2SecurityScopes
```

**override point.** The OAuth2 scopes this operation requires, as a `{ name: description }` map. Defaults to
a single scope named after `operationId`, described by `info.summary`.

Return `{}` to make the operation **public**: no scope is registered, `scopes` stays unset, no security
validator is installed, and [`filterAuthorizedDocument`](api.md#filterauthorizeddocument) always keeps it.
That is how [`SchemaResource`](schemas.md#schemaresource) stays readable by everyone.

### `mcpTool`

```ts
get mcpTool(): MCPToolInfo | false | undefined
```

**override point.** Per-operation MCP customization, taking precedence over the resource's `mcp.tools` entry.
Return `false` to hide this operation from the MCP server even though its resource opted in. Only consulted
when the resource is opted in. See [mcp.md](mcp.md#mcptoolinfo).

## Building the OpenAPI definition

```ts
protected getInfo(opts?: any): OpenAPIV3.OperationObject
protected getDefaultInfo(opts?: any): OpenAPIV3.OperationObject
protected getCustomInfo(opts?: any): OpenAPIV3.OperationObject
```

`getInfo` deep-extends `getDefaultInfo` with `getCustomInfo` (via
[eredita](https://github.com/vivocha/eredita)'s `deepExtend`), and is called once from the constructor.

`getDefaultInfo` supplies the skeleton: `operationId` (`<resourceName>.<internalId>`), `tags`, and a `default`
response referencing `#/components/responses/defaultError`.

**`getCustomInfo` is the override point you want.** It's where every built-in operation puts its summary,
parameters, request body and responses, and where your subclass should too:

```ts
protected getCustomInfo(): OpenAPIV3.OperationObject {
  return {
    summary: 'Retrieve the current user',
    parameters: [{ $ref: '#/components/parameters/fields' }],
    responses: {
      '200': { description: 'The current user', content: { 'application/json': { schema: { $ref: 'User' } } } },
    },
  };
}
```

Override `getDefaultInfo` instead only when you're building a base class for a family of operations and want
subclasses to keep the `getCustomInfo` slot for themselves. Deep-extend means arrays are merged by index, not
concatenated — so a subclass's `parameters` entry overwrites the parent's entry at the same position. When
extending an operation that already declares parameters, read the parent's list and build a new one rather
than relying on the merge.

## Validators

All are `protected` and called from [`router`](#router). Override to change how a request is parsed or
checked.

```ts
protected createParameterValidators(key: string, parameters: OpenAPIV3.ParameterObject[]): APIRequestHandler
```

Builds a middleware validating one group of parameters, where `key` is the request property to read
(`headers`, `cookies`, `params`, `query`). Each parameter becomes an openapi-police `ParameterObject`; values
are validated with `setDefault: true`, so declared defaults are written back onto the request. A missing
required parameter raises a `ValidationError`.

```ts
protected createJSONParser(type?: string | string[]): RequestHandler
protected createUrlencodedParser(): RequestHandler
protected createBodyValidators(): undefined | APIRequestHandler[]
protected createBodyValidator(type: string, bodySpec: OpenAPIV3.MediaTypeObject, required?: boolean): APIRequestHandler
```

`createBodyValidators` picks a parser and a validator from `info.requestBody.content`, checking, in order:
`application/json`, `application/json-patch+json`, `application/x-www-form-urlencoded`. Only the **first**
match is served — a request body declaring several media types is validated against one of them.

With no `requestBody` declared but a method of `put`, `post` or `patch`, a bare JSON parser is installed and
the body is left unvalidated.

Bodies are validated with `context: 'write'`, so `readOnly` properties are **stripped** — silently, with no
error — and `writeOnly` ones kept. Nothing validates responses, so `writeOnly` has no effect on output.
`coerceTypes` is on for everything except `application/json`, where the wire format already carries types.

An empty body with no `content-length` is treated as absent: rejected with a `ValidationError` if the body is
required, passed through otherwise.

## Authorization

The whole of it is one method.

### `getAuthorizationError`

```ts
protected getAuthorizationError(req: APIRequest): RESTError | undefined
```

**override point, and the single decision point.** Returns the reason the caller of `req` may not perform
this operation, or `undefined` if they may:

| Condition | Result |
|---|---|
| `this.scopes` unset (no OAuth2 schemes, or `swaggerScopes` returned `{}`) | `undefined` — public |
| `req.ability` set and [`checkAbility`](#checkability) passes | `undefined` |
| `req.ability` set and `checkAbility` throws | `403 insufficient privileges`, with the CASL error as `originalError` |
| no ability, `req.scopes` matches `this.scopes` | `undefined` |
| no ability, `req.scopes` doesn't match | `403 insufficient privileges` |
| neither ability nor scopes on the request | `401 no scope` |

A missing credential is a `401` so the client knows to authenticate; a credential that is merely insufficient
is a `403`.

Override this — never `securityValidator` — to add a requirement of your own, because three separate
behaviours derive from it:

```ts
class SignedOperation extends Operation {
  protected getAuthorizationError(req: APIRequest): RESTError | undefined {
    if (!verifyToken(req.headers['x-my-token'])) {
      return API.newError(401, 'invalid token');
    }
    return super.getAuthorizationError(req);
  }
}
```

- [`securityValidator`](#securityvalidator) enforces it on a real request;
- [`isAuthorized`](#isauthorized) reports it without dispatching anything, which is what MCP `tools/list` and
  the bundle catalogue filter on;
- [`API.filterAuthorizedDocument`](api.md#filterauthorizeddocument) prunes `openapi.json` with it.

A check added in `securityValidator` instead is invisible to the other two, so the API would advertise
endpoints and tools it then refuses.

### `isAuthorized`

```ts
isAuthorized(req: APIRequest): boolean
```

`!this.getAuthorizationError(req)`. Don't override.

### `securityValidator`

```ts
protected securityValidator(req: APIRequest, res: APIResponse, next: NextFunction): void
```

The middleware enforcing `getAuthorizationError`, installed by [`router`](#router) when
[`useSecurityValidator`](#usesecurityvalidator) says so. Logs the reason and passes the error to `next`.

### `useSecurityValidator`

```ts
protected useSecurityValidator(): boolean
```

**override point.** Whether to install the security validator at all. Defaults to `!!this.scopes`.

### `checkAbility`

```ts
checkAbility(ability: Ability, data?: any, filterFields?: boolean, filterData?: boolean): any
```

Runs the CASL check for every `(subject, action)` pair in `this.scopes`, over `data` when given. Delegates to
[`checkAbility`](authorization.md#checkability) in `src/util.ts`; see there for what `filterFields` and
`filterData` do. Without `data` it throws unless the ability permits the action outright.

### `checkAbilityForPath`

```ts
checkAbilityForPath(ability: Ability, path: string): boolean
```

Whether the ability permits the action on a specific dotted field path. Returns `true` when `scopes` is
unset. Used by [`PatchMongoOperation`](mongo-operations.md#patchmongooperation) to authorize each JSON Patch
target before touching the database.

### `filterFields`

```ts
filterFields(ability: Ability, data: any): any
```

`checkAbility(ability, data, true)` — returns `data` with the fields the ability forbids removed, instead of
throwing.

### `permittedFields`

```ts
permittedFields(ability: AnyMongoAbility): Set<string>
```

The union of field names the ability permits across this operation's scopes, using `**` for rules with no
field restriction.

## Serving

### `attach`

```ts
attach(api: API): void
```

Called by [`Resource.attach`](resource.md#attach). It:

1. registers `info` at `documentPath`/`method` and redefines `this.info` as a getter onto the document;
2. registers every [`swaggerScopes`](#swaggerscopes) entry as an OAuth2 scope;
3. adds a `security` requirement to `info` for each declared security scheme — the scope names for OAuth2
   schemes, an empty array for others;
4. sets `this.scopes` when at least one scope name was registered.

Steps 2 and 4 read [`swaggerScopes`](#swaggerscopes); step 3 reads the document's
`components.securitySchemes`. They are independent: **`scopes` is set — and the security validator installed —
whether or not the API declares a security scheme.** An operation is public only when `swaggerScopes` is empty.
Declaring a scheme late (after `addResource`) still gets the scopes registered in its `scopes` map, but the
operations attached before it have no `security` requirement in the document.

### `router`

```ts
async router(router: Router): Promise<Router>
```

Registers the route with its middleware chain, in this order:

1. [`securityValidator`](#securityvalidator), if enabled
2. header parameter validators
3. `cookie-parser` and cookie parameter validators
4. path parameter validators (all forced to `required: true`)
5. query parameter validators
6. body parser and body validator
7. [`handler`](#handler)
8. [`errorHandler`](#errorhandler)

Security comes first, which is why an authentication failure on a JSON-RPC or MCP endpoint surfaces as a
plain HTTP `401`/`403` rather than as a protocol-level error: the body has not been parsed yet.

### `handler`

```ts
abstract handler(req: APIRequest, res: APIResponse, next?: NextFunction)
```

The operation itself. Implement it, or extend [`PipelineOperation`](pipeline.md) and implement `runOperation`
instead.

There is **no `runOperation` on `Operation`**. It comes from `PipelineOperation` and its Mongo descendants.

### `errorHandler`

```ts
protected errorHandler(err: any, req: APIRequest, res: APIResponse, next: NextFunction): void
```

**override point.** A per-operation error middleware. The default forwards to `next`, so the API's
[`handleError`](api.md#handleerror) reports it. [`JSONRPC`](rpc.md#errors) overrides it to answer with
a JSON-RPC error envelope.

## `SimpleOperation`

```ts
class SimpleOperation extends Operation {
  constructor(customHandler: APIRequestHandler, resource: Resource, path: string, method: Method, id?: string)
}
```

Wraps a plain Express handler. Created for you when you pass a function to
[`addOperation`](resource.md#addoperation). It has no `getCustomInfo`, so its document entry holds only the
default skeleton — fine for an internal endpoint, thin for a public one. Once you want a real definition,
write an `Operation` subclass.

---

[← Resource](resource.md) · [Reference index](README.md) · [PipelineOperation →](pipeline.md)
