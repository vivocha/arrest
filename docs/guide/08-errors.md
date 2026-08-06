# Errors

arrest has one error class, one response shape, and one place errors are reported. Everything else — validation
failures, driver errors, thrown strings — is mapped onto them.

The complete surface is in [reference/errors.md](../reference/errors.md). This page is the model.

## One shape

```json
{
  "error": 404,
  "message": "not_found",
  "info": "the requested resource cannot be found"
}
```

Every error your API produces looks like this, because every error goes through the same writer. `error` repeats
the status code in the body — redundant over HTTP, useful when the response is logged, embedded, or read by a
client that doesn't surface status codes. `message` is a short machine-ish reason; `info` is anything that helps
the caller fix the request.

It is declared in the document as `#/components/schemas/errorResponse` and referenced by the `defaultError`
response, which [`getDefaultInfo`](../reference/operation.md#building-the-openapi-definition) attaches to
**every** operation. So the shape is part of your published contract without you doing anything.

## One class

```ts
new RESTError(code, message?, info?, originalError?);
API.newError(code, message?, info?, originalError?);   // the same thing
API.fireError(code, message?, info?, originalError?);  // …thrown, return type `never`
```

`newError` and `fireError` differ only in whether you're in a `next(...)` position or a `throw` position:

```ts
if (!doc) return next(API.newError(404, 'not_found'));   // callback style
if (!doc) API.fireError(404, 'not_found');               // async style — `never`, so no return needed
```

The fourth argument, `originalError`, is the one people miss. It carries the cause — the driver error, the CASL
`ForbiddenError`, the failed upstream call — and it is **never serialized into the response**. It exists for the
log:

```ts
try {
  await upstream.fetch(id);
} catch (err) {
  API.fireError(502, 'upstream unavailable', { service: 'billing' }, err);
}
```

The client gets `{ error: 502, message: 'upstream unavailable', info: { service: 'billing' } }`; your log gets the
real stack. This is the whole discipline of error handling in arrest: decide what the caller needs to fix its
request, put everything else in `originalError`.

## One reporter

```
throw / next(err)
      │
      ├─ Operation.errorHandler       per operation, installed last in its router
      │     └─ next(err) by default
      │
      ├─ API.handleError              the API router's last middleware
      │
      └─ API.handle404Error           nothing matched at all
```

[`handleError`](../reference/errors.md#handleerror) maps whatever reaches it:

| `err.name` | Response |
|---|---|
| `'RESTError'` | `err.code`, with its message and info |
| `'ValidationError'` | **`400`**, message `ValidationError`, `info` from `ValidationError.getInfo` |
| anything else | **`500`**, message `internal`, **no info** — logged with its stack |

That third row is the security property: an error you didn't anticipate tells the client nothing. No message, no
stack, no field names, no SQL, no file paths. The detail is in the log and only in the log. You never have to
audit your error paths for leaks, because the default leaks nothing.

Note that dispatch is on `err.name`, not `instanceof`. A `RESTError` from a different copy of arrest — two
versions in a dependency tree — is still recognized.

## Validation errors are automatically 400s

`ValidationError` comes from [openapi-police](https://github.com/vivocha/openapi-police), is re-exported by
arrest, and is thrown by the validators built from your operation's `parameters` and `requestBody`. `handleError`
maps it to a `400` with structured info:

```json
{
  "error": 400,
  "message": "ValidationError",
  "info": { "type": "required", "path": "body.name", "scope": "…" }
}
```

`path` tells the client which value was wrong, `type` which keyword rejected it. You get this for free for every
declared parameter and body.

You can throw one yourself for a rule a schema can't express, and it is reported identically:

```ts
if (job.doc.start > job.doc.end) {
  throw new ValidationError('body.start', 'inline', 'range');
}
```

That is better than a `RESTError(400, …)` for input problems: same status, but the client gets the same structured
shape it already parses for schema failures.

## Where to intervene

### `handleError` on the API — reporting

For logging, metrics or an incident tracker:

```ts
class MyAPI extends API {
  handleError(err: any, req: APIRequest, res: APIResponse, next?: NextFunction) {
    if (!(err.name === 'RESTError' && err.code < 500)) {
      Sentry.captureException(err);      // client mistakes aren't incidents
    }
    super.handleError(err, req, res, next);
  }
}
```

The `< 500` guard is the point: a `404` or a `400` is the client's problem, not yours, and reporting them as
incidents buries the ones that matter.

One caveat: `handleError` is registered with `router.use` **unbound**, so `this` inside your override is not the
API instance. Reach the API through `req.app` or a closure if you need it.

### `Operation.errorHandler` — a different envelope

An override point on the operation, a no-op by default. Override it when an operation's errors need a different
*format*, not a different report. [`JSONRPC`](../reference/rpc.md#errors) is the in-tree example: it turns errors
into JSON-RPC error objects, with HTTP status 200, because that is what a JSON-RPC client reads.

**It is not reached by a [`PipelineOperation`](../reference/pipeline.md)**, which catches its own errors and calls
`api.handleError` directly — and that includes all six Mongo operations. To change how those report, override
`handleError` on the API, or catch inside the pipeline step where the error arises.

### `RESTError.send` — outside an operation

```ts
RESTError.send(res, 429, 'rate limited', { retryAfter: 30 });
```

Writes the response directly. For middleware that runs before the arrest router, where there is no error handler
to hand anything to. Inside an operation, throw instead, so the error is logged.

## Status codes arrest produces

| Code | Message | When |
|---|---|---|
| `400` | `ValidationError` | any parameter or body validator |
| `400` | `duplicate key` | `POST` hitting a unique index |
| `401` | `no scope` | operation needs a credential, request has none |
| `403` | `insufficient privileges` | credential exists, doesn't grant this |
| `404` | `not_found` | no document matched — **including one the caller's ability excludes**, and a malformed ObjectId |
| `404` | `Not Found` | `handle404Error` — no route at all |
| `405` | `Method Not Allowed` | a path a resource owns, with a method it doesn't handle |
| `500` | `internal` | anything unrecognized |

Two of these are worth internalizing.

**`404` for a forbidden record**, not `403`, because a `403` confirms the record exists. Same for a malformed
ObjectId: `GET /people/nonsense` is a `404`, not a `400`, so probing for valid id formats learns nothing.

**`401` versus `403`** is the difference between "authenticate" and "don't bother retrying" — see
[the security model](06-security-model.md#401-versus-403).

## Errors that aren't responses

Some failures happen while the router is being built, and they throw:

- `Required operationId missing` — an operation whose `getInfo` produced none;
- `Error removing unreferenced schemas…` — a `$ref` to something that doesn't exist;
- `Unable to rebase schema definitions…` — a malformed schema;
- `double routes specification`, `invalid method`, `invalid handler…` — a resource declared wrongly;
- `Invalid version` — `info.version` isn't semver.

These are meant to kill the process. An API whose document is wrong should not start; there is nothing a running
process can do about a dangling `$ref` except serve a broken contract. And because
[`router()` memoizes](07-express-integration.md#router-is-memoized), the failure is permanent for that instance —
no retry loop will fix it.

The corollary for your test suite: **call `await api.router()` somewhere**. A test that only constructs the API
never runs these checks.

---

[← Express integration](07-express-integration.md) · [Manual index](../README.md) · [Tutorial →](../tutorial/00-setting-up.md)
