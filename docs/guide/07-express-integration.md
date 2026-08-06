# Express integration

arrest produces an Express `Router`. Everything you know about Express still applies — this page is about the
three ways to serve that router, the ordering rules that matter, and the parts of a production setup arrest
doesn't provide.

## Three ways to serve

### `listen` — arrest owns the server

```ts
await api.listen(3000);
await api.listen(3000, 3443, { key, cert });     // http + https
```

Creates its own `express()` app, mounts the router at the root, appends
[`handle404Error`](../reference/errors.md#handle404error), and starts one or two servers. Returns the server, or
an array of both.

Right for a service that is only this API. Note it mounts at the **root**, not at `/v<major>` — no version
prefix, so `GET /people` and `GET /openapi.json`.

### `router` — you own the app

```ts
const app = express();

app.use(compression());
app.use('/api/v1', await api.router());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(API.handle404Error);
app.listen(3000);
```

The normal shape for a service that does more than serve this API. You choose the mount path, the surrounding
middleware and the process management.

Two things `listen` does for you that you now must do yourself: **install `API.handle404Error`** as the last
middleware (without it an unmatched path gets Express's HTML 404, inconsistent with every other error your API
produces), and start the server.

### `attach` — versioned mounting

```ts
const base = express.Router();
await api.attach(base);          // mounts at /v<semver major of info.version>
app.use(base);
```

Mounts the router at `/v` + the major of `info.version`. With `version: '15.2.0'` that is `/v15`, so
`GET /v15/people`.

This is how you run versions side by side: two `API` instances, two documents, one base router.

```ts
await v1Api.attach(base);   // → /v1
await v2Api.attach(base);   // → /v2
app.use('/api', base);      // → /api/v1/people, /api/v2/people
```

Each version serves its own `openapi.json`, at `/api/v1/openapi.json` and `/api/v2/openapi.json`, each with
`servers` pointing at its own base — because the base URL is computed per request from `req.baseUrl`.

## `router()` is memoized

```ts
router(options?: RouterOptions): Promise<Router>
```

The first call builds everything; every later call returns the **same promise**. So:

- **Resources added after the first `router()` are ignored.** Add everything, then serve.
- **`options` on later calls are ignored** — only the first call's are used.
- **A startup failure is permanent** for that instance: the rejected promise is what every later call gets. A
  bad `$ref` or a duplicate `operationId` fails the process at boot, which is where you want it.
- Calling it twice is safe and cheap, which is what makes `attach` (which calls `router` internally) composable.

In tests, build the router once per API instance and share it:

```ts
let request: supertest.SuperTest<supertest.Test>;

before(async () => {
  const app = express();
  app.use(await api.router());
  request = supertest(app);
});
```

## Middleware order

arrest installs, inside its own router and in this order:

```
1. logger middleware                → req.logger
2. initSecurity                     → req.scopes / req.ability
3. GET /openapi.json
4. each resource's sub-router, in the order resources were added
5. handleError
```

Which tells you where your own middleware goes.

**Before the arrest router** — anything that must run for every request including `openapi.json`: CORS,
compression, request ids, rate limiting, access logging. Note that `req.logger` doesn't exist yet here; type
these handlers as taking Express's `Request`, not [`APIRequest`](../reference/types.md#apirequest).

**Inside `initSecurity`** — authentication. It runs after the logger and before every operation, which is exactly
where credential extraction belongs.

```ts
class MyAPI extends API {
  initSecurity(req: APIRequest, res: APIResponse, next: NextFunction): void {
    // req.logger is available here
    super.initSecurity(req, res, next);   // or don't call it — the default grants '*'
  }
}
```

Don't call `super.initSecurity` if you're setting the credential yourself: the default sets `req.scopes` to
`new Scopes('*')` when nothing else did, which would grant everything to an anonymous caller.

**After the arrest router** — `handle404Error`, and any catch-all.

Body parsing is per operation, installed from the operation's `requestBody`. **Do not add `express.json()`
globally**: it consumes the stream before arrest's own parser, which then sees an empty body and can't
distinguish "absent" from "empty" — a `required` body validator will reject valid requests. If some other part of
your app needs a global parser, mount it on that part's path, not the root.

## Route order

Within a resource, routes are matched **in the order the operations were added**, because that is the order they
were registered on the Express router. Express matches the first pattern that fits, so a parametric route added
before a specific one swallows it:

```ts
// WRONG — '/:id' matches 'statistics', so the second route is dead
const routes = { '/:id': { get: ReadPerson }, '/statistics': { get: PersonStats } };
```

```ts
// RIGHT — specific first
const routes = { '/statistics': { get: PersonStats }, '/:id': { get: ReadPerson } };
```

Since [`Routes`](../reference/resource.md#routes) is a plain object, insertion order is what you wrote. When
merging into [`MongoResource.defaultRoutes()`](../reference/mongo-resource.md#defaultroutes-static) — whose keys are
`'/'` then `'/:id'` — build a new object with your specific paths first:

```ts
const routes: MongoRoutes = {
  '/statistics': { get: PersonStats },      // specific
  ...MongoResource.defaultRoutes(),         // then '/' and '/:id'
};
```

The failure mode is quiet: `GET /people/statistics` returns a `404 not_found` from `ReadPerson`, because
`statistics` is not a valid id, rather than an error saying you have shadowed a route.

Across resources, order matters only if two resources share a base path prefix, which is worth avoiding.

## The 405

After mounting its operations, each resource registers `r.all(path, …)` for **every path it owns**, answering
`405 Method Not Allowed`. So `DELETE /people` on a resource with only `GET` and `POST` at `/` is a `405`, not a
`404`.

This is registered after the operations, so it never shadows them, and it is per resource — a path no resource
owns is a `404` from `handle404Error`.

`OPTIONS` is included, so if you need CORS preflight, install a CORS middleware **before** the arrest router.

## Behind a proxy

`GET /openapi.json` builds its `servers` entry from `x-forwarded-proto || req.protocol`, `Host`, and
`req.baseUrl`. With TLS terminated at a proxy, `req.protocol` is `http` and the header is what saves you — so
your proxy must set `x-forwarded-proto`, and you probably want:

```ts
app.set('trust proxy', true);
```

Without a `Host` header at all, `openapi.json` answers `400` — there is no base URL to advertise.

## A production shape

```ts
import express from 'express';
import compression from 'compression';
import { MongoClient } from 'mongodb';
import { API } from 'arrest';

const client = await MongoClient.connect(process.env.MONGO_URL!);
const db = client.db();

const api = new MyAPI({ title: 'People', version: '15.0.0' });
api.document.components!.securitySchemes = { oauth2: { … } };   // before addResource
api.addResource(new PersonResource(db));

const app = express();
app.set('trust proxy', true);
app.use(compression());
app.use(requestId());

const base = express.Router();
await api.attach(base);          // /v15
app.use('/api', base);           // /api/v15/people

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(API.handle404Error);

const server = app.listen(3000);

process.on('SIGTERM', () => {
  server.close(async () => {
    await client.close();
    process.exit(0);
  });
});
```

Points worth copying: **one `MongoClient` for the process**, passed as a `Db` to every resource rather than a
connection string per resource (a string makes arrest connect once per resource); `attach` for the version
prefix; the health check outside the API, so it needs no scope and stays up while the database is down; and
graceful shutdown, which arrest doesn't do for you — `listen` returns the server precisely so you can.

---

[← The security model](06-security-model.md) · [Manual index](../README.md) · [Errors →](08-errors.md)
