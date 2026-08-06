# MCP

Sources: [src/mcp/](../../src/mcp/) — [types.ts](../../src/mcp/types.ts),
[resource.ts](../../src/mcp/resource.ts), [operation.ts](../../src/mcp/operation.ts),
[provider.ts](../../src/mcp/provider.ts), [schema.ts](../../src/mcp/schema.ts),
[dispatch.ts](../../src/mcp/dispatch.ts)

arrest can expose the operations of an API as [Model Context Protocol](https://modelcontextprotocol.io) tools.
The implementation is native — MCP is JSON-RPC 2.0 and arrest already speaks it via [`JSONRPC`](rpc.md) — so
there is no extra dependency, and a tool call is performed by re-dispatching a request through the API's own
router rather than by a second code path.

Everything on this page is exported from the package root.

```ts
import { API, MCPResource, MongoResource } from 'arrest';

const api = new API();
api.addResource(new MongoResource(db, { name: 'Order', mcp: true }));
api.addResource(new MCPResource());
```

That serves `POST /mcp` and `GET /mcp`. The transport is stateless Streamable HTTP: one self-contained
JSON-RPC call per `POST`, re-authenticated by the middleware chain, with no server-side session.

## Constants

| Constant | Value |
|---|---|
| `MCP_PROTOCOL_VERSION` | `'2025-06-18'` |
| `MCP_SUPPORTED_PROTOCOL_VERSIONS` | `['2025-06-18', '2025-03-26']`, most recent first |
| `MCP_DEFAULT_MAX_OUTPUT_CHARS` | `100000` |
| `MCP_DEFAULT_BUNDLE` | `'default'` |
| `MCP_BODY_ARGUMENT` | `'body'` — the tool argument carrying the request body |

`MCPErrorCode` is the JSON-RPC code enum: `parseError` `-32700`, `invalidRequest` `-32600`,
`methodNotFound` `-32601`, `invalidParams` `-32602`, `internalError` `-32603`.

## Opting a resource in

[`ResourceDefinition.mcp`](resource.md#resourcedefinition) is `boolean | MCPResourceOptions`. `true` means
"every operation, default bundle".

```ts
interface MCPResourceOptions {
  bundles?: string[];                                  // default ['default']
  operations?: string[];                               // whitelist by Operation.internalId
  tools?: { [internalId: string]: MCPToolInfo | false };
}
```

| Field | Effect |
|---|---|
| `bundles` | Which [bundles](#bundles) the resource appears in |
| `operations` | Whitelist by [`internalId`](operation.md#constructor) (`'query'`, `'read'`, …). Absent means every operation is a candidate |
| `tools` | Per-operation customization, keyed by `internalId`. `false` hides that operation |

```ts
api.addResource(
  new MongoResource(db, {
    name: 'Customer',
    namePlural: 'Customers',
    mcp: {
      bundles: ['default', 'sales'],
      operations: ['query', 'read'],
      tools: {
        query: {
          name: 'search_customers',
          description: 'Search customers using RQL, e.g. eq(status,active),sort(-created_at)',
          omitParameters: ['format', 'csv_fields', 'csv_names', 'csv_options'],
        },
        read: { bundles: ['sales'] },   // narrow one tool to one bundle
      },
    },
  })
);
```

An operation is exposed in a bundle when **all** of these hold, as decided by
`ResourceToolProvider.isSelected`:

1. `operations` is absent or includes its `internalId`;
2. neither `tools[internalId]` nor [`mcpTool`](#mcptool) is `false`;
3. the bundle is in the first of `mcpTool.bundles`, `tools[internalId].bundles`, `options.bundles` that is
   set — so a tool-level `bundles` **replaces** the resource-level list rather than intersecting with it.

### `MCPToolInfo`

```ts
interface MCPToolInfo {
  name?: string;
  description?: string;
  inputSchema?: any;
  outputSchema?: any;
  annotations?: MCPToolAnnotations;
  omitParameters?: string[];
  bundles?: string[];
}
```

| Field | Default |
|---|---|
| `name` | [`toolNameFor(resourceName, internalId)`](#input-and-output-schemas) — `order_query`. Must match `^[a-zA-Z0-9_-]{1,128}$` |
| `description` | `info.summary`, else `info.description`, else `Execute <operationId>` |
| `inputSchema` | [derived from the operation](#input-and-output-schemas). Replacing it replaces the whole thing |
| `outputSchema` | the 2xx JSON response schema when it describes an object. Set to `false`/`null` to suppress |
| `annotations` | [`annotationsFor(method)`](#input-and-output-schemas), merged — your entries win |
| `omitParameters` | `[]`. Parameter names to hide from the model; `'body'` hides the request body |
| `bundles` | the resource's `bundles` |

`description` is the single most important field for tool-selection accuracy. An explicit, example-rich
description is worth more than any amount of schema detail.

`annotations.title`, if set, is also copied to the tool's top-level `title`.

### `MCPToolAnnotations`

```ts
interface MCPToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}
```

Hints only. MCP clients use them to decide whether a call needs confirmation; **they are not a security
boundary**.

### `mcpTool`

An operation can carry its own customization, which takes precedence over the resource's `tools` entry —
useful when the operation class, not the resource definition, is where the knowledge lives:

```ts
class ExportOperation extends PipelineOperation {
  get mcpTool() {
    return { description: 'Export the catalogue as CSV. Ask for at most 500 rows at a time.' };
  }
}

class InternalOperation extends PipelineOperation {
  get mcpTool() {
    return false as const;   // hidden even though the resource opted in
  }
}
```

The merge is a **shallow spread** — `{ ...tools[internalId], ...op.mcpTool }` — so an `mcpTool` returning
`{ description }` keeps the resource's `omitParameters`, but one returning `{ annotations: { title } }`
replaces the resource's whole `annotations` object.

See [`Operation.mcpTool`](operation.md#mcptool).

## `MCPResource`

Source: [src/mcp/resource.ts](../../src/mcp/resource.ts)

```ts
constructor(options: MCPOptions = {}, info: ResourceDefinition = {})
```

A [`Resource`](resource.md) named `MCP` (both singular and plural, so the base path is not pluralized),
serving one [`MCPOperation`](#mcpoperation) per bundle plus the [catalogue](#mcpcatalogueoperation).

```ts
interface MCPOptions {
  path?: string;                                    // default 'mcp'
  bundles?: { [id: string]: MCPBundleDefinition };  // default { default: {} }
  serverInfo?: MCPImplementation;                   // default the API title and version
  catalogue?: boolean;                              // default true
}
```

| Option | Effect |
|---|---|
| `path` | Resource path, so `POST /mcp` and `POST /mcp/<bundleId>`. Passed through `ResourceDefinition.path` |
| `bundles` | The bundles to expose. An empty object is treated as absent |
| `serverInfo` | `{ name, version, title? }` returned by `initialize`. Overrides the derived value for **every** bundle |
| `catalogue` | `false` drops `GET /mcp` |

`info` overrides the resource definition — name, description, tags — for the rare case where the defaults
clash with your API.

Add it **after** the resources it exposes or before, either works: providers are resolved on first use rather
than at attach time.

### Bundles

A real API has dozens of resources, which makes a single tool list unusable for a model. Tools are grouped
into bundles; each bundle is a separate endpoint, a separate arrest `Operation`, and therefore has **its own
OAuth2 scope**.

```ts
api.addResource(
  new MCPResource({
    bundles: {
      default: { title: 'Acme API', instructions: 'General purpose tools.' },
      sales: { title: 'Sales tools', description: 'Read and update orders and customers.', maxOutputChars: 20000 },
    },
  })
);
```

```
POST /mcp            the "default" bundle, scope MCP.default
POST /mcp/sales      the "sales" bundle, scope MCP.sales
GET  /mcp            the bundles reachable by the caller
```

The default bundle sits at the resource root; every other bundle at `/<id>`. Each appears as its own path in
`openapi.json`, and a token can hold one bundle's scope and not another's.

```ts
interface MCPBundleDefinition {
  title?: string;
  description?: string;
  instructions?: string;    // free-text usage instructions returned by initialize
  maxOutputChars?: number;  // default MCP_DEFAULT_MAX_OUTPUT_CHARS
}
```

### Methods

| Method | Description |
|---|---|
| `getBundleIds(): string[]` | The configured bundle ids |
| `getBundleOperation(id): Operation \| undefined` | The `MCPOperation` serving a bundle, i.e. its endpoint |
| `getBundle(id): MCPBundleDefinition` | The definition, `{}` for an unknown id |
| `getProviders(id): MCPProvider[]` | The providers serving a bundle — derived ones first, then those added with `addProvider` |
| `addProvider(id, provider): this` | Register an extra [provider](#mcpprovider). Throws `Error('Unknown MCP bundle <id>')` |
| `createProvider(resource, id)` | **override point.** Build the provider for an opted-in resource. Defaults to a [`ResourceToolProvider`](#resourcetoolprovider) |
| `createOperation(id, path, method?)` | **override point.** Build a bundle endpoint. Defaults to an `MCPOperation` |
| `createCatalogueOperation()` | **override point.** Defaults to an `MCPCatalogueOperation` |
| `scopeDescription` | `'Unrestricted access to all MCP endpoints'` |

`getProviders` memoizes the derived providers per bundle on first call, which is why resources added to the
API *after* the `MCPResource` are still picked up: the resolution happens on the first request, not at
`addResource` time. Providers registered with `addProvider` are concatenated on every call, so they can be
added at any point before the first request.

## `MCPOperation`

Source: [src/mcp/operation.ts](../../src/mcp/operation.ts)

```ts
constructor(resource: MCPResource, path: string, method: Method = 'post', id?: string)
```

Extends [`JSONRPC`](rpc.md), which extends [`Operation`](operation.md) — so a bundle endpoint is documented in
`openapi.json`, has its own scope and is protected by the standard
[`securityValidator`](operation.md#securityvalidator). `internalId` is the bundle id, exposed as `bundleId`,
so the operation ids are `MCP.default`, `MCP.sales` and so on.

| Member | Description |
|---|---|
| `bundleId` | The bundle this endpoint serves |
| `serverInfo` | `mcpOptions.serverInfo`, else `{ name: '<API title>' (+ ' (<bundleId>)' for a non-default bundle), version: <API version>, title? }` |
| `maxOutputChars` | `bundle.maxOutputChars ?? MCP_DEFAULT_MAX_OUTPUT_CHARS` |
| `notificationStatus` | `202`, as MCP mandates for a notification |
| `getProviders()` | `resource.getProviders(this.bundleId)` |
| `getCapabilities()` | **override point.** See below |
| `truncate(result)` | Enforces `maxOutputChars` on every text block of a result |
| `errorHandler` | See [error mapping](#error-mapping) |

`getCapabilities` derives what it advertises from **both** the JSON-RPC methods this class implements and the
providers that serve them: `tools` appears only if `this['tools/list']` exists *and* some provider implements
`listTools`. The same pattern is prepared for `resources` and `prompts`, so a subclass adding those methods
gets them advertised without touching this class.

### JSON-RPC methods

| Method | Behaviour |
|---|---|
| `initialize` | Echoes the requested `protocolVersion` when it is in `MCP_SUPPORTED_PROTOCOL_VERSIONS`, otherwise answers `MCP_PROTOCOL_VERSION`. Returns `capabilities`, `serverInfo` and the bundle's `instructions` if set |
| `ping` | `{}` |
| `notifications/initialized` | Nothing — answered with `202` because it carries no id |
| `tools/list` | See below |
| `tools/call` | See below |

Anything else is `-32601 Unknown method <name>`, from [`JSONRPC.dispatch`](rpc.md#dispatch).

#### `tools/list`

Concatenates `listTools(req)` across the bundle's providers. A **duplicate tool name within one bundle
throws** `Error('Duplicate MCP tool name "<name>" in bundle "<id>"')`, which surfaces as an internal error —
it is a configuration mistake, not a runtime condition, and silently shadowing one tool with another would be
worse.

Each provider filters by authorization, so the list holds only tools the caller can actually invoke. See
[Security](#security).

#### `tools/call`

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "order_query", "arguments": { "limit": 10 } } }
```

A missing or non-string `name` is `-32602 Missing tool name`. Otherwise the providers are asked in order via
[`providerHasTool`](#providerhastool) and the first owner performs the call; the result is passed through
`truncate`. No owner is `-32602 Unknown tool <name>` — which is also what an *unauthorized* tool looks like,
since the filter removed it from the provider's view.

`truncate` appends, to any text block longer than `maxOutputChars`:

```
[output truncated at 100000 characters; narrow the request with the limit, fields or q arguments]
```

Hosted MCP clients offload anything larger to a file, costing the model the ability to reason about the result
inline — hence truncating explicitly and telling the model how to narrow the request.

### Error mapping

`errorHandler` maps failures to the MCP error model:

| Failure | Reported as |
|---|---|
| the request never reached the JSON-RPC layer (no parsed body) | a plain HTTP error — the `401`/`403` from the security validator, so the client knows to authenticate |
| a `JSONRPCError` | itself, as a JSON-RPC error object |
| a `ValidationError` — including a body that isn't a JSON-RPC envelope, and any batch request | `-32600 Invalid request`, with `ValidationError.getInfo(err)` as `data` |
| a [`RESTError`](errors.md#resterror) | `-32603` carrying `err.message` and `err.info` |
| anything else | `-32603 internal error`, logged at error level |

Batch requests are not supported: the request body schema declares an object, so an array fails validation and
becomes `-32600`.

Note that this is about *protocol* failures. A tool call that reaches the operation and gets a non-2xx
response is **not** an error here — it is a successful JSON-RPC response carrying an `isError` tool result, so
the model can read the reason and correct course.

## `MCPCatalogueOperation`

`GET /mcp` — the bundles the caller can reach, each with the tools it exposes.

```json
[
  { "id": "default", "title": "Acme API", "url": "https://api.example.com/v1/mcp",
    "tools": ["order_query", "order_read"] },
  { "id": "sales", "title": "Sales tools", "url": "https://api.example.com/v1/mcp/sales",
    "tools": ["search_customers"] }
]
```

A bundle whose endpoint answers `false` to [`isAuthorized`](operation.md#isauthorized) is **left out
entirely**, so the catalogue never advertises an endpoint that would answer `403`. `url` is built from
`x-forwarded-proto` (falling back to `req.protocol`), the `host` header and `req.baseUrl`, so it is correct
behind a reverse proxy that sets the former.

Useful for discovery when an API offers several bundles, and to check what a given token is actually allowed to
do. Drop it with `catalogue: false`.

## `MCPProvider`

Source: [src/mcp/types.ts](../../src/mcp/types.ts)

`MCPOperation` speaks protocol and nothing else; the features it serves come from providers.

```ts
interface MCPProvider {
  listTools?(req: APIRequest): Promise<MCPTool[]>;
  hasTool?(name: string, req: APIRequest): Promise<boolean>;
  callTool?(name: string, args: any, req: APIRequest): Promise<MCPToolResult>;
  listResources?(req: APIRequest): Promise<MCPResourceDescriptor[]>;
  readResource?(uri: string, req: APIRequest): Promise<MCPResourceContents>;
  listPrompts?(req: APIRequest): Promise<MCPPrompt[]>;
  getPrompt?(name: string, args: any, req: APIRequest): Promise<MCPPromptResult>;
}
```

Every method is optional. The current implementation calls only the tool half, but the resource and prompt
methods are part of the contract: a subclass of `MCPOperation` adding the corresponding JSON-RPC methods has
them advertised automatically, because [`getCapabilities`](#mcpoperation) looks at what the providers
implement.

Register one directly for anything that doesn't map to an existing operation:

```ts
const mcp = new MCPResource();
mcp.addProvider('default', {
  async listTools(req) {
    return [{ name: 'whoami', description: 'Report the scopes of the caller', inputSchema: { type: 'object', properties: {} } }];
  },
  async callTool(name, args, req) {
    return { content: [{ type: 'text', text: `Your scopes are ${req.scopes}` }] };
  },
});
api.addResource(mcp);
```

A hand-written provider is **outside** the operation-level authorization filter — nothing checks
`req.scopes` for you. The bundle's own scope still protects the endpoint, but if a tool needs more than that,
check it in `listTools` and `callTool` yourself.

### `providerHasTool`

```ts
export async function providerHasTool(provider: MCPProvider, name: string, req: APIRequest): Promise<boolean>
```

Prefers the provider's own `hasTool`, falls back to searching `listTools`, and answers `false` when the
provider implements neither. This is how ownership of a tool is decided, so a provider whose tool list is
expensive to build can answer one call without materializing everything it could offer.

### `MCPToolResult`

```ts
interface MCPToolResult {
  content: MCPContent[];             // MCPTextContent | MCPResourceLinkContent
  structuredContent?: any;
  isError?: boolean;
}
```

## `ResourceToolProvider`

Source: [src/mcp/provider.ts](../../src/mcp/provider.ts)

```ts
constructor(
  resource: Resource,
  bundleId: string,
  bundle: MCPBundleDefinition = {},
  providerOptions?: ResourceToolProviderOptions
)
```

Exposes the operations of a [`Resource`](resource.md) as tools. `MCPResource` creates one per opted-in
resource per bundle; you construct one yourself only for a resource that isn't in the API document — see
[`DynamicToolProvider`](#dynamictoolprovider).

```ts
interface ResourceToolProviderOptions extends MCPResourceOptions {
  toolNamePrefix?: string;
}
```

`providerOptions`, when given, **replaces** the resource's own `mcp` definition — which a resource that is not
part of the document cannot have. `toolNamePrefix` replaces the resource name in generated tool names, so
several providers exposing resources that share a name (one per tenant, one per dynamically created data
model) keep their tools distinct within a bundle.

| Member | Description |
|---|---|
| `getBindings(req)` | A [binding](#mcptoolbinding) per selected, authorized operation |
| `listTools(req)` | The tools of those bindings |
| `hasTool(name, req)` | Same filter, without building any schema |
| `callTool(name, args, req)` | Finds the binding and [invokes](#invoke) it. Throws `Error('Unknown tool <name>')` |
| `options` | **override point.** `providerOptions`, else the resource's `mcp` object, else `{}` |
| `isSelected(op)` | **override point.** The [selection rules](#opting-a-resource-in) |
| `getToolInfo(op)` | **override point.** `{ ...tools[internalId], ...op.mcpTool }` |
| `toolNameOf(op, info)` | **override point.** Kept separate from `createBinding` so ownership can be settled without generating a schema |
| `createBinding(op, info)` | **override point.** Builds the `MCPTool` from the operation's document entry |
| `invoke(binding, args, req)` | **override point.** [Argument routing and dispatch](#invoke) |
| `toToolResult(binding, response)` | **override point.** [HTTP response → tool result](#totoolresult) |
| `getResultMetadata(response)` | **override point.** The pagination note added to a successful result |

### `MCPToolBinding`

```ts
interface MCPToolBinding {
  tool: MCPTool;
  operation: Operation;
  parameters: { [name: string]: OpenAPIV3.ParameterObject };
}
```

`parameters` is the operation's resolved parameters keyed by name, used to route each argument to the path, the
query string or a header.

`createBinding` reads the operation's definition from
[`api.getOriginalDocument()`](api.md#getoriginaldocument) — the *unresolved* snapshot — falling back to
`op.info` when the resource isn't in a document. That matters: once jsonref has parsed the document, `$ref`s
are live proxies and recursive schemas are circular, neither of which can be serialized to a client.

### `invoke`

Arguments are split by looking each name up in `parameters`:

| Argument | Goes to |
|---|---|
| named `body`, with no parameter of that name | the request body |
| a `path` parameter | the path, `encodeURIComponent`d |
| a `header` parameter | a request header, lower-cased, stringified |
| a `query` parameter | the query string |
| **unknown** | the query string, so the operation's own validators decide |

Values are passed through **uncoerced**: the operation's `ParameterObject` validators are the single source of
truth for coercion and validation, and a tool call must not be able to anticipate or bypass them. Array values
are appended repeatedly; object values are flattened to `key[subkey]=value`.

The assembled request then goes through [`dispatchInternal`](#dispatchinternal).

### `toToolResult`

| Response | Tool result |
|---|---|
| 2xx | the body as text (`JSON.stringify(…, null, 2)` unless it is already a string), plus a [metadata note](#getresultmetadata) if the response had pagination headers, plus `structuredContent` when the tool has an `outputSchema` and the body is a non-array object |
| anything else | `isError: true` and a single text block: `The operation failed with status <status>: <payload>` |

Reporting a failure as a **tool result** rather than a JSON-RPC error is deliberate: the model reads
`403 insufficient privileges`, or the detail of a `ValidationError`, and can correct course. Only protocol-level
problems are JSON-RPC errors.

### `getResultMetadata`

Surfaces what arrest returns in headers, which a model would otherwise not see. When `Results-Matching` is
present:

```
120 items match the query, 20 skipped, more items are available: repeat the call increasing skip
```

The last clause appears when the response carried a [`Link`](mongo-operations.md#runoperation) header.

## `DynamicToolProvider`

Source: [src/mcp/provider.ts](../../src/mcp/provider.ts)

```ts
abstract class DynamicToolProvider implements MCPProvider {
  protected abstract getProviders(req: APIRequest): Promise<MCPProvider[]>;
  protected findProvider(name: string, req: APIRequest): Promise<MCPProvider | undefined>;
}
```

Resources built on the fly — one per tenant, per data model, per plugin — are not in `api.getResources()`, so
`MCPResource` cannot discover them: only the request says which of them exist and which the caller can see.
Implement `getProviders`, typically returning a `ResourceToolProvider` per resource you built for this request,
and this class aggregates them and routes calls.

```ts
class TenantToolProvider extends DynamicToolProvider {
  protected async getProviders(req: APIRequest): Promise<MCPProvider[]> {
    const models = await loadModelsVisibleTo(req);
    return Promise.all(
      models.map(async (model) => {
        const { resource } = await buildResourceFor(req, model);   // must await api.router()
        return new ResourceToolProvider(resource, 'custom', {}, {
          bundles: ['custom'],
          operations: ['query', 'read'],
          toolNamePrefix: `custom_${model.id}`,                    // custom_<id>_query, custom_<id>_read, …
        });
      })
    );
  }

  // optional, and worth it: resolve one provider from a tool name instead of building them all
  protected async findProvider(name: string, req: APIRequest): Promise<MCPProvider | undefined> {
    const match = /^custom_([a-z0-9]+)_/.exec(name);
    return match ? this.buildProviderFor(req, match[1]) : undefined;
  }
}

mcp.addProvider('custom', new TenantToolProvider());
```

- `getProviders` is called **once per `tools/list`** and once per unresolved tool name, so an implementation
  that builds resources should cache whatever is expensive.
- `findProvider` is the seam that keeps a call cheap. The default asks every provider via `providerHasTool`;
  an override that can tell from the tool name alone builds one provider only. It is called **at most once per
  tool name per request**, memoized in a `WeakMap` keyed by the request — so the `hasTool`/`callTool` pair a
  single call performs resolves once, and nothing is retained between requests.
- The resource you build must belong to an API whose `router()` has been awaited, since `dispatchInternal`
  dispatches through it.

## Input and output schemas

Source: [src/mcp/schema.ts](../../src/mcp/schema.ts)

These functions derive a tool descriptor from an OpenAPI operation object. They take the **unresolved**
document, for the reason given [above](#mcptoolbinding).

| Function | Returns |
|---|---|
| `toolNameFor(resourceName, internalId)` | `'order_query'` — both parts decamelized, invalid characters collapsed to `_`, trimmed to 128 chars, `'tool'` if nothing survives |
| `annotationsFor(method)` | `readOnlyHint` for `get`/`head`/`options`; `destructiveHint` for `delete`; `idempotentHint` for `get`/`head`/`options`/`put`/`delete` |
| `operationParameters(info, doc?)` | The parameters, `$ref`s resolved. Cookie parameters and unresolvable `$ref`s are **skipped** |
| `operationRequestBody(info, doc?)` | `{ schema, required }` from `application/json`, else `application/x-www-form-urlencoded` |
| `operationResponseSchema(info, doc?)` | The `application/json` schema of the first `2xx` response |
| `operationToInputSchema(info, doc?, omitParameters?)` | The tool's `inputSchema` |
| `operationToOutputSchema(info, doc?)` | The tool's `outputSchema`, or `undefined` |
| `resolveComponentRef(doc, ref)` | Resolves `#/components/<section>/<name>`; `undefined` for anything else |

`operationToInputSchema` produces one property per parameter — with the parameter's `description` copied onto
the schema when the schema has none — plus a `body` property from the request body. A parameter is required
when it says so **or when it is a path parameter**, which [`Operation.router`](operation.md#router) enforces
anyway.

`operationToOutputSchema` returns nothing unless the response schema describes an **object**, because MCP
requires structured content to be a JSON object: operations returning arrays or scalars report their result as
text only. A bare `$ref` is wrapped as `{ type: 'object', allOf: [ref] }` rather than followed.

### `$defs` bundling

Every `#/components/schemas/X` a tool schema depends on is copied into `$defs` and the references rewritten to
`#/$defs/X`, transitively. Bundling rather than inlining is required because arrest schemas are frequently
recursive — a resource schema referencing itself would make inlining non-terminating. The bundler reserves the
name before recursing, so a self-reference terminates; `enum`, `const`, `examples` and `default` values are
deep-cloned rather than walked.

References that are not local component schemas are left alone.

## `dispatchInternal`

Source: [src/mcp/dispatch.ts](../../src/mcp/dispatch.ts)

```ts
export async function dispatchInternal(api: API, parentReq: APIRequest, request: InternalRequest): Promise<InternalResponse>

interface InternalRequest {
  method: Method;
  url: string;                             // relative to the API router, query string included
  params?: { [name: string]: any };
  query?: { [name: string]: any };
  body?: any;
  headers?: { [name: string]: string };
}
interface InternalResponse {
  status: number;
  headers: { [name: string]: any };
  body: any;                               // parsed when the content type is JSON
  text: string;                            // the raw payload
}
```

Performs an operation of the API as if it had been requested over HTTP, on behalf of the caller of
`parentReq`. This is the whole of arrest's MCP security story, so it is worth stating precisely what it does:

- the sub-request **inherits from `parentReq` through the prototype chain**, carrying over everything
  upstream middleware attached — `logger`, `scopes`, `ability`, `user`, session, your tenant — without this
  module knowing about any of it;
- it is handed to `await api.router()` directly, so `baseUrl` is cleared and the MCP endpoint's mount point
  doesn't leak into the sub-request's url;
- `query` is set directly, because Express parses query strings in app-level middleware that isn't in play
  here, and `_body` is set so body-parser doesn't try to read an already-consumed stream;
- the response is a real `http.ServerResponse` with `parentReq.res`'s prototype grafted on, and `write`/`end`
  are replaced to collect the payload;
- if no route matched, the promise resolves with the API's own `404` body rather than rejecting;
- if the router runs out of handlers with an error still pending — the API declined to report it — the promise
  **rejects**.

Because the sub-request goes through the router, the operation's security validator, parameter and body
validators, handler, error handler and CASL field redaction all apply exactly as they would to a real HTTP
request. There is no second code path to keep in sync, because there is no second code path.

It is not MCP-specific: use it for any internal call that should be authorized as the caller.

## Security

The consequences of the above, spelled out:

- **The endpoint is protected by default.** Each bundle operation has its own scope and the standard
  security validator. An authentication failure is a plain `401`/`403`, not a JSON-RPC error, so a client can
  see it has to authenticate.
- **Unauthorized tools are hidden.** `listTools` and `hasTool` filter by
  [`Operation.isAuthorized`](operation.md#isauthorized), which derives from the same
  [`getAuthorizationError`](operation.md#getauthorizationerror) that `securityValidator` enforces and
  `?filter=authorized` uses. An operation that authorizes on something of its own overrides that one method
  and is then filtered *and* enforced consistently. Overriding `securityValidator` instead still enforces, but
  the check is invisible to `tools/list`, which would advertise a tool the operation refuses to serve.
- **Hiding is not enforcement.** A `tools/call` on an unlisted tool is refused because the provider doesn't
  admit to owning it, and would be refused again by the operation's validator. The filtering exists so a model
  isn't offered tools it can't use.
- **Arguments are uncoerced.** The operation's validators decide.
- **Failures reach the model.** A non-2xx response is a tool result with `isError`, carrying the API's own
  error body.
- **Output is truncated** at `maxOutputChars`, with a note telling the model how to narrow the request.
- **Annotations are hints**, not a boundary.

See [authorization.md](authorization.md) for the mechanics of the decision itself.

## Limitations

- **JSON Patch cannot be driven over MCP.** `operationRequestBody` reads `application/json` and
  `application/x-www-form-urlencoded` only, so an operation whose body is `application/json-patch+json` gets
  no `body` argument. [`PatchMongoOperation`](mongo-operations.md#patchmongooperation) declares its body as
  `application/json` and is therefore exposed, but a hand-written patch operation using the patch media type
  is not.
- **Cookie parameters are dropped** from tool schemas.
- Not implemented: `completion/*`, SSE streaming, stateful sessions, elicitation, sampling, `tools/list`
  cursors, and the resource and prompt halves of the protocol — for which the extension points exist.

## Extending

Each remaining part of the surface lands as a subclass plus a provider method, with no change to the protocol
core:

```ts
class FullMCPOperation extends MCPOperation {
  @rpc
  async 'resources/list'(params: any, req: APIRequest) {
    const resources: MCPResourceDescriptor[] = [];
    for (const provider of this.getProviders()) {
      if (provider.listResources) {
        resources.push(...(await provider.listResources(req)));
      }
    }
    return { resources };
  }
}

class FullMCPResource extends MCPResource {
  protected createOperation(bundleId: string, path: string) {
    return new FullMCPOperation(this, path, 'post', bundleId);
  }
}
```

`getCapabilities` then advertises `resources` on its own, because the method exists and a provider implements
`listResources`.

The seams, summarized: `MCPResource.createProvider` to substitute your provider, `MCPResource.createOperation`
to substitute your endpoint, `ResourceToolProvider.getToolInfo` to change how tools are derived,
`ResourceToolProvider.toToolResult` to change how results are reported,
`DynamicToolProvider.findProvider` to resolve a provider cheaply.

## Talking to it

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <token>' \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}'
```

then `{"jsonrpc":"2.0","id":1,"method":"tools/list"}` and
`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"order_query","arguments":{"limit":10}}}`.

The MCP Inspector (`npx @modelcontextprotocol/inspector`) works against the endpoint: pick Streamable HTTP and
supply a bearer token holding the bundle scope plus the scopes of the resources it exposes.

---

[← Authorization](authorization.md) · [Reference index](README.md) · [JSON-RPC →](rpc.md)
