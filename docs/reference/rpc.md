# JSON-RPC

Source: [src/rpc.ts](../../src/rpc.ts)

`JSONRPC` is an [`Operation`](operation.md) that speaks [JSON-RPC 2.0](https://www.jsonrpc.org/specification)
over a single HTTP endpoint. Methods are ordinary class methods marked with the `@rpc` decorator.

It is what [`MCPOperation`](mcp.md#mcpoperation) is built on, and it is useful on its own for the operations
that don't fit REST: a batch of bulk actions, an interactive protocol, a call whose "resource" is a verb.

```ts
import { API, JSONRPC, rpc, Resource } from 'arrest';

class Calculator extends JSONRPC {
  @rpc
  async sum({ x = 0, y = 0 } = {}): Promise<number> {
    return x + y;
  }
  @rpc
  async pow({ x = 0, y = 0 } = {}): Promise<number> {
    return Math.pow(x, y);
  }
}

const api = new API();
api.addResource(new Resource({ name: 'Math' }, { '/': { post: Calculator } }));
```

```bash
curl -X POST localhost:3000/maths \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"sum","params":{"x":3,"y":4},"id":100}'
# {"jsonrpc":"2.0","result":7,"id":100}
```

The class is `abstract`, so it must be subclassed — there are no methods to serve otherwise.

TypeScript needs `"experimentalDecorators": true` for `@rpc`. See
[installation](../guide/02-installation.md).

## `rpc`

```ts
export function rpc(target: JSONRPC, propertyKey: string): void
```

A method decorator. It sets `rpc = true` on the function, and [`dispatch`](#dispatch) refuses to call anything
that doesn't carry the flag — so `getCustomInfo`, `handler`, `errorHandler` and every other member of the class
are unreachable from a request. An undecorated method is answered exactly like a nonexistent one:
`-32601 Unknown method <name>`.

The decorator takes no arguments and cannot rename a method: the JSON-RPC method name **is** the property
name. Quoted property names work, which is how MCP's `tools/list` and `notifications/initialized` are declared:

```ts
class MyRPC extends JSONRPC {
  @rpc
  async 'items/list'(params: any, req: APIRequest): Promise<any> {
    /* … */
  }
}
```

## Method signature

```ts
method(params: any, req: APIRequest, res: APIResponse): Promise<any> | any
```

`params` is `req.body.params` verbatim — an object or an array, whatever the caller sent. The declared request
body schema allows both, and **nothing validates `params`**: JSON-RPC has no schema for it, so validating it is
the method's own job.

Return a value and it becomes `result`. Throw and see [errors](#errors). Write to `res` yourself — for a
streamed or non-JSON response — and the handler notices `res.writableEnded` and doesn't try to answer again.

## `JSONRPCError`

```ts
export class JSONRPCError extends Error {
  constructor(public code: number, message: string, public data?: any);
}
```

Throw it to answer with a specific JSON-RPC error object. `code`, `message` and `data` are copied into the
response as they are.

```ts
@rpc
async transfer(params: any): Promise<any> {
  if (!params?.amount) {
    throw new JSONRPCError(-32602, 'Missing amount', { field: 'amount' });
  }
  /* … */
}
```

The MCP layer's [`MCPErrorCode`](mcp.md#constants) enum names the conventional codes; there is no such enum in
`src/rpc.ts` itself.

## The document

`getCustomInfo` declares the endpoint as `POST` with a required `application/json` body:

```
{ jsonrpc: '2.0', method: <non-empty string>, params?: object | array, id?: string | integer | null }
```

`additionalProperties: false`, so **a body with any other property is a `400`**, reported by the standard
error handler rather than as a JSON-RPC error. Same for a batch request: the schema says object, an array
fails, and the caller gets a validation error. Batching is not supported.

The `200` response is documented as the JSON-RPC envelope, with `result` unconstrained and `error` as
`{ code, message, data? }`.

Override `getCustomInfo` to document your methods — the summary and description are the only place a client
can learn what they are, since JSON-RPC has no introspection. Call `super.getCustomInfo()` and extend it, or
replace it entirely if you also want to change the body schema; note that
[`getInfo` deep-extends arrays by index](operation.md#building-the-openapi-definition).

An operation with a body schema means [`createBodyValidators`](operation.md#validators) installs a JSON parser
and a validator, so `req.body` is a parsed, validated envelope by the time `handler` runs.

## Members

| Member | Description |
|---|---|
| `handler(req, res, next)` | Dispatches, then answers. Not usually overridden |
| `dispatch(method, params, req, res)` | **override point.** Method lookup and invocation |
| `errorHandler(err, req, res, next)` | **override point.** [Error mapping](#errors) |
| `notificationStatus` | **override point.** HTTP status acknowledging a notification. `200`; MCP overrides it to `202` |
| `isNotification(body)` | **override point.** `body.id` absent or `null` |
| `requestId(body)` | The id to echo: `null` for a notification |
| `isRPCRequest(req)` | Whether the body was parsed at all |

### `dispatch`

```ts
protected async dispatch(method: string, params: any, req: APIRequest, res: APIResponse): Promise<any>
```

Looks `method` up as a property of `this`, checks the `rpc` flag, and calls it. Override to implement a
different lookup — a registry, a namespace prefix, a proxy to another service — as long as unknown methods keep
throwing a `-32601` `JSONRPCError`.

### Notifications

A request whose `id` is absent or `null` is a notification: the method runs, its return value is discarded, and
the response is `notificationStatus` with an empty body.

`0` and `''` are **valid ids**, not notifications — `isNotification` tests for `undefined` and `null`
specifically. A client using `id: 0` for its first call gets a proper response.

An error raised by a notification is still reported, as a JSON-RPC error object with `id: null`. That is
technically more than the specification requires, and it is deliberate: a silent failure of a
fire-and-forget call is worse than an unexpected body.

## Errors

`errorHandler` maps a failure to the JSON-RPC error model. Note the **HTTP status stays `200`** in every
case below: the failure is in the envelope, which is what a JSON-RPC client reads.

| Failure | Response |
|---|---|
| a `JSONRPCError` | `{ jsonrpc, error: { code, message, data }, id }` |
| any other error, with a parsed body | `{ jsonrpc, error: { code: -32000, message: 'server error' }, id }` — the detail is not disclosed |
| any other error, **without** a parsed body | passed to `next(err)`, so [`API.handleError`](api.md#handleerror) reports it as a plain HTTP error |

That last row is the important one. A request rejected before the JSON-RPC layer — by the
[security validator](operation.md#securityvalidator), which runs first, or by the body validator — has no
JSON-RPC request to answer. Reporting it as `200 {"error": …}` would hide the `401` a client needs in order to
know it has to authenticate, so it is reported as a plain HTTP error instead.

`-32000` is in the implementation-defined server-error range. Throwing a `JSONRPCError` is how you say more
than "something failed"; a bare `throw` deliberately says nothing.

For a subclass that maps richer failures — `RESTError`s, validation errors — see
[`MCPOperation.errorHandler`](mcp.md#error-mapping), which does exactly that and delegates to `super` for the
final write.

## Mounting

`JSONRPC` is an operation, so it goes wherever an operation goes: a path of its own on an existing resource, or
a resource with one route.

```ts
// alongside the REST surface of a resource
const routes = MongoResource.defaultRoutes();
routes['/rpc'] = { post: BulkOperations };
api.addResource(new MongoResource(db, { name: 'Person', namePlural: 'People' }, routes));
```

The `internalId` derived from `('/rpc', 'post')` is `rpc`, so the operation id is `Person.rpc` and the scope
`Person.rpc`. Pass a fourth constructor argument, or add it via
[`addOperation`](resource.md#addoperation), to name it something else.

Being a normal operation also means it is authorized normally: one scope for the whole endpoint. If different
methods need different permissions, check them inside the methods — [`checkAbility`](operation.md#checkability)
and `req.scopes.match` are available — because the security validator runs once, before `method` is known.

---

[← MCP](mcp.md) · [Reference index](README.md) · [Errors →](errors.md)
