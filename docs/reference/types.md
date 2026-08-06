# Types

Source: [src/types.ts](../../src/types.ts)

Four declarations, all re-exported from the package root. They are what you write in the signature of every
handler, validator and override that touches a request.

```ts
import { APIRequest, APIRequestHandler, APIResponse, Method, METHODS } from 'arrest';
```

## `APIRequest`

```ts
export interface APIRequest extends Request {
  scopes?: Scopes;
  ability?: Ability;
  logger: Logger;
}
```

An Express `Request` plus the three things arrest attaches to it. `Request` is Express's own, so `params`,
`query`, `body`, `headers` and everything else are there unchanged.

| Property | Set by | Meaning |
|---|---|---|
| `scopes` | your [`initSecurity`](api.md#initsecurity) | The caller's [`@vivocha/scopes`](authorization.md#scopes) permissions |
| `ability` | your `initSecurity` | The caller's [CASL ability](authorization.md#abilities) |
| `logger` | `API.router()`, first middleware | A per-request [debuggo](https://github.com/vivocha/debuggo) logger |

Both `scopes` and `ability` are optional because arrest never populates them itself: authentication is yours to
implement. The [default `initSecurity`](api.md#initsecurity) sets `scopes` to `new Scopes('*')` — everything
allowed — and logs a warning, which is the behaviour you get if you never override it.

`ability` takes precedence over `scopes` when both are set; see
[getAuthorizationError](operation.md#getauthorizationerror).

### `logger`

```ts
interface Logger {
  log; info; warn; error; debug; trace;   // each a debug() instance
  setLevel(level: 'trace' | 'debug' | 'log' | 'info' | 'warn' | 'error'): void;
  pushContext(entry: string); popContext(); resetContext();
}
```

Use it rather than `console` inside operations: every line is tagged with the API's debug label and a
per-request context id, so one request's lines can be picked out of a busy log.

```ts
protected async runOperation(job: Job): Promise<Job> {
  job.req.logger.debug('running', this.info.operationId);
  return super.runOperation(job);
}
```

Output is off until enabled, the usual [debug](https://github.com/debug-js/debug) way:

```bash
DEBUG=arrest* node dist/index.js
```

The label comes from [`API.getDebugLabel`](api.md#logging) — `'arrest'` by default,
worth overriding to your service's name — and the context from `getDebugContext`, an incrementing `#<n>`.

`logger` is declared **non-optional** even though the middleware that sets it is installed by `router()`. A
request reaching an arrest handler always has one. But a handler you wrote and mounted *before* the arrest
router, and typed as taking an `APIRequest`, does not — the type says it is there and it isn't. Type those as
Express's `Request`.

## `APIResponse`

```ts
export interface APIResponse extends Response {
  logger: Logger;
}
```

Express's `Response` with the same logger, so an error handler that only receives `res` can still log in
context. `res.logger` and `req.logger` are the same object for a given request, except inside
[`dispatchInternal`](mcp.md#dispatchinternal), which copies the parent request's logger onto its synthetic
response.

## `APIRequestHandler`

```ts
export interface APIRequestHandler extends RequestHandler {
  (req: APIRequest, res: APIResponse, next?: NextFunction): any;
}
```

An Express `RequestHandler` narrowed to the arrest request and response types. Note `next` is **optional** —
handlers that always answer don't have to declare it.

This is the type [`addOperation`](resource.md#addoperation) accepts in place of an operation class, which is how
a plain function becomes an operation:

```ts
import { API, APIRequest, APIRequestHandler, APIResponse, Resource } from 'arrest';

const ping: APIRequestHandler = (req: APIRequest, res: APIResponse) => {
  req.logger.info('ping');
  res.json({ ok: true });
};

api.addResource(new Resource({ name: 'Health' }, { '/ping': { get: ping } }));
```

Internally that gets wrapped in a [`SimpleOperation`](operation.md#simpleoperation), so it is validated,
authorized and documented like any other operation — the handler is just its body.

Because it extends `RequestHandler`, an `APIRequestHandler` can be passed to `app.use` and any Express-typed
API. The reverse is not true: an Express `RequestHandler` isn't assignable to `APIRequestHandler` without a
cast, since it promises less about `req`.

## `Method` and `METHODS`

```ts
export type Method = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch';
export const METHODS: Method[] = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
```

The HTTP methods an operation can be mounted on — the OpenAPI 3.1 set minus `trace`. `Method` is the type
[`Routes`](resource.md#routes) and `addOperation` key on:

```ts
const routes: Routes = { '/': { get: QueryPeople, post: CreatePerson } };
```

`METHODS` is the same list as values, for walking a document: an OpenAPI path item mixes operations in with
`summary`, `parameters`, `$ref` and `servers`, and this is how you tell them apart.
[`filterAuthorizedDocument`](api.md#filterauthorizeddocument) uses it exactly so:

```ts
for (const path in doc.paths) {
  for (const method of METHODS) {
    const op = doc.paths[path]?.[method];
    if (op) {
      /* … */
    }
  }
}
```

Iterating `Object.keys(pathItem)` instead would treat `parameters` as an operation.

Since it is a mutable array, don't push to it — nothing copies it before use.

---

[← Utilities](utilities.md) · [Reference index](README.md) · [Guide →](../guide/01-introduction.md)
