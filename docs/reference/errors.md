# Errors

Sources: [src/error.ts](../../src/error.ts), [src/api.ts](../../src/api.ts),
[src/defaults.ts](../../src/defaults.ts)

arrest has one error class, one response shape and one place errors are reported. Everything else — validation
failures, driver errors, thrown strings — is mapped onto them.

The reasoning behind the design is in [the errors guide](../guide/08-errors.md); this page is the surface.

## The response shape

```json
{
  "error": 404,
  "message": "not_found",
  "info": "the requested resource cannot be found"
}
```

`error` (the status code, repeated in the body) and `message` are required; `info` is optional. It is declared
in the document as `#/components/schemas/errorResponse` and referenced by the
[`defaultError` and `notFound` responses](defaults.md#responses), which every generated operation declares.

`info` is declared as a `string` in the default schema, but nothing enforces that — arrest itself puts objects
and arrays there, notably the output of `ValidationError.getInfo`. Treat the declared type as documentation of
the common case, not a constraint.

## `RESTError`

```ts
export class RESTError extends Error {
  constructor(public code: number, message?: string, public info?: any, public originalError?: any);
  static send(res: Response, code: number, message?: string, info?: any): void;
}
```

| Member | Meaning |
|---|---|
| `code` | The HTTP status code. Sent as the response status *and* as the body's `error` |
| `message` | Short machine-ish reason: `not_found`, `duplicate key`, `insufficient privileges` |
| `info` | Anything that helps the caller fix the request. Serialized into the body |
| `originalError` | The underlying cause. **Never serialized** — for logs only |
| `name` | `'RESTError'`, set in the constructor |

`name` is what [`handleError`](#handleerror) dispatches on, not `instanceof`, so an error crossing a module or
realm boundary is still recognized.

`originalError` is where you put the driver error, the CASL `ForbiddenError`, the failed HTTP call — anything
you want in the log but not in the response. [`getAuthorizationError`](operation.md#getauthorizationerror) uses
it for exactly that.

### `RESTError.send`

```ts
RESTError.send(res, 429, 'rate limited', { retryAfter: 30 });
```

Writes the response directly: status, then the JSON body. Use it in middleware that runs outside an
operation — a rate limiter, an authentication layer — where there is no `next` to hand an error to. Inside an
operation, prefer throwing or `next`-ing a `RESTError` so `handleError` logs it.

`info` is included even when `undefined`, so the body always has the key. Harmless, but worth knowing if you
compare response bodies in tests.

## Creating errors

```ts
API.newError(code, message?, info?, err?): RESTError
API.fireError(code, message?, info?, err?): never
```

Both are static on [`API`](api.md#newerror--fireerror-static). `newError` returns the error, `fireError` throws
it — the difference is whether you're in a `next(...)` position or a `throw` position:

```ts
// callback style
if (!doc) {
  return next(API.newError(404, 'not_found'));
}

// async style
if (!doc) {
  API.fireError(404, 'not_found');
}
```

`fireError`'s return type is `never`, so TypeScript narrows correctly after it and no `return` is needed for the
compiler's sake.

`new RESTError(...)` is equivalent to `API.newError(...)`; the static exists so operations don't need a second
import.

## Who reports what

```
throw / next(err)
      │
      ├─ Operation.errorHandler        per operation, installed last in its router
      │     └─ next(err) by default
      │
      ├─ API.handleError               the API router's error middleware
      │
      └─ API.handle404Error            nothing matched at all (installed by listen)
```

### `handleError`

```ts
handleError(err: any, req: APIRequest, res: APIResponse, next?: NextFunction): void
```

Installed by [`API.router()`](api.md#router) as the last middleware, so it sees every error not already
answered.

| `err.name` | Response | Log level |
|---|---|---|
| `'RESTError'` | `err.code` with `err.message` and `err.info` | error, `REST ERROR` |
| `'ValidationError'` | **`400`** with message `'ValidationError'` and `ValidationError.getInfo(err)` as `info` | error, `DATA ERROR` |
| anything else | **`500`** with message `'internal'` and no info | error, `GENERIC ERROR` + stack |

Two things follow from the last row. A non-`RESTError` never reveals anything about itself to the client — no
message, no stack, no info. And it is logged with its stack, so the detail is in the log and only in the log.

Override it to add reporting, then call `super`:

```ts
class MyAPI extends API {
  handleError(err: any, req: APIRequest, res: APIResponse, next?: NextFunction) {
    if (!(err.name === 'RESTError' && err.code < 500)) {
      Sentry.captureException(err);   // client mistakes aren't incidents
    }
    super.handleError(err, req, res, next);
  }
}
```

It is passed to `router.use` **unbound**, so `this` inside an override is not the API instance unless you bind
it. Reference the API through `req.app` or a closure, or install a bound wrapper of your own.

### `Operation.errorHandler`

```ts
protected errorHandler(err: any, req: APIRequest, res: APIResponse, next: NextFunction): void
```

**override point**, and a no-op by default: it calls `next(err)`, handing the error to `handleError`.

Override it to answer an operation's errors differently — [`JSONRPC`](rpc.md#errors) is the in-tree example,
turning them into JSON-RPC error objects.

One caveat: [`PipelineOperation`](pipeline.md) calls `this.api.handleError` **directly** from its handler, so
**`errorHandler` is never reached by a pipeline operation** — including all six
[Mongo operations](mongo-operations.md). To change how those report, override `handleError` on the API, or
catch inside the pipeline step.

### `handle404Error`

```ts
static handle404Error(req: APIRequest, res: APIResponse, next: NextFunction): void
```

Answers `404 Not Found` with `'the requested resource cannot be found, check the endpoint URL'`.
[`listen`](api.md#listen) installs it after the router; if you mount the router in your own app, install it
yourself — as the last middleware, after every other route:

```ts
const app = express();
app.use(await api.router());
app.use(API.handle404Error);
```

Without it, an unmatched path falls through to Express's own HTML 404, which is inconsistent with every other
error the API produces.

Note that a path a resource *does* own but with the wrong method gets a **405** from
[`Resource.router`](resource.md#router) instead, which is more specific and comes first.

## Validation errors

`ValidationError` comes from [openapi-police](https://github.com/vivocha/openapi-police) and is re-exported by
arrest. It is thrown by the parameter and body validators
[`Operation.router` installs](operation.md#validators), so you rarely construct one — but you can, to reject
something the schema can't express:

```ts
import { ValidationError } from 'arrest';

if (job.doc.start > job.doc.end) {
  throw new ValidationError('body.start', 'inline', 'range');
}
```

The arguments are the path of the offending value, the scope of the schema that rejected it, and the keyword
that failed. `ValidationError.getInfo(err)` renders the error — and any nested errors — into the structure that
lands in the response's `info`, so a client sees which field failed and why:

```json
{
  "error": 400,
  "message": "ValidationError",
  "info": { "type": "required", "path": "body.name", "scope": "…" }
}
```

Because `handleError` maps any `ValidationError` to `400`, a validation failure anywhere — a parameter, a body,
your own check inside a pipeline step — is a client error by construction.

## Status codes arrest produces

| Code | Message | Raised by |
|---|---|---|
| `400` | `Bad Request` | `GET /openapi.json` without a `Host` header, or with an unsupported `filter` |
| `400` | `ValidationError` | any parameter or body validator |
| `400` | `duplicate key` | [`CreateMongoOperation`](mongo-operations.md#createmongooperation) on a `11000` driver error |
| `401` | `no scope` | [`getAuthorizationError`](operation.md#getauthorizationerror) with no credential at all |
| `403` | `insufficient privileges` | `getAuthorizationError`; also `checkAbility` on a forbidden field |
| `404` | `not_found` | every Mongo operation on `/:id` when nothing matched — **including a record the caller's ability excludes**, and a malformed ObjectId |
| `404` | `Not Found` | `handle404Error`, and [`dispatchInternal`](mcp.md#dispatchinternal) when no route matched |
| `405` | `Method Not Allowed` | `Resource.router`, for a known path with an unhandled method |
| `500` | `internal` | `handleError` for anything unrecognized; also a driver error other than `11000` |

`404`-for-forbidden is deliberate: a `403` would confirm the record exists. See
[record constraints](authorization.md#record-level-constraints).

## Errors at startup

Not every failure is a response. These throw while the router is being built, before anything is served:

| Error | Cause |
|---|---|
| `Error('Required operationId missing')` | An operation whose `getInfo` produced no `operationId` |
| `Error('invalid method')` / `Error('invalid handler, …')` | [`addOperation`](resource.md#addoperation) called with an incomplete triple |
| `Error('double routes specification')` | Routes passed both in `info.routes` and as the constructor's second argument |
| `Error('Unable to rebase schema definitions, check the Schema.')` | [`rebaseOASDefinitions`](schemas.md#rebaseoasdefinitions) on a malformed schema |
| `Error('Error removing unreferenced schemas. …')` | A `$ref` pointing at something that doesn't exist — [`removeUnusedSchemas`](schemas.md#removeunusedschemas) |
| `Error('Invalid request body')` / `Error('Schema missing for content type …')` | A `requestBody` with no `content`, or a media type with no `schema` |
| `Error('no listen ports specified')` / `Error('no https options')` | [`listen`](api.md#listen) |

`router()` memoizes its promise, so a failure here is permanent for that `API` instance: every later
`router()` returns the same rejected promise. Build the document correctly at startup and let the process fail
loudly — that is the intent.

---

[← JSON-RPC](rpc.md) · [Reference index](README.md) · [Defaults →](defaults.md)
