# 14 — Production shape

**Goal:** assemble everything the previous thirteen chapters did one at a time, the way a service that has to
stay up does it — and know which of the tutorial's conveniences to throw away.

## The code

[examples/tutorial/src/steps/14-production.ts](../../examples/tutorial/src/steps/14-production.ts) is the whole
of it. Four moves.

**One: subclass `API`.** Security, shared middleware and anything else cross-cutting live in one class rather
than being repeated per resource:

```ts
class TutorialAPI extends API {
  initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction): void {
    const tenant = req.headers['x-tenant'];
    if (typeof tenant === 'string') {
      (req as any).tenant = tenant;
    }

    req.ability = defineAbility((can) => {
      if (req.headers['x-admin']) {
        can('manage', 'all');
      } else {
        can(['query', 'read', 'statistics'], 'Person', ['_id', 'name', 'country', 'tags.**']);
        can(['default', 'catalogue'], 'MCP');
        can('rpc', 'Maintenance');
      }
    }) as Ability;

    next();
  }
}
```

**Two: a JSON-RPC endpoint** for the calls that don't fit REST:

```ts
class MaintenanceRPC extends JSONRPC {
  @rpc
  async countPeople(params: { country?: string } = {}): Promise<number> {
    return this.db.collection('people').countDocuments(params.country ? { country: params.country } : {});
  }

  /** Not decorated: calling "reindex" gets -32601 Unknown method. */
  async reindex(): Promise<void> {}
}

class MaintenanceResource extends Resource {
  constructor(db: Db) {
    super({ name: 'Maintenance', namePlural: 'Maintenance', description: 'Operational RPCs' });
    this.addOperation(new MaintenanceRPC(db, this, '/', 'post'));
  }
}
```

**Three: own the Express app**, because a real deployment has a probe and a catch-all:

```ts
export async function createServer(): Promise<express.Express> {
  const app = express();
  const api = await createApi();

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  await api.attach(app as unknown as express.Router);

  app.use((_req, res) => {
    RESTError.send(res, 404, 'Not Found', 'the requested resource cannot be found, check the endpoint URL');
  });

  return app;
}
```

**Four: the MCP server from chapter 13**, with the ability deciding which bundle this caller reaches.

## Run it

This is the one chapter whose entry point is a server rather than an API, so
[main.ts](../../examples/tutorial/src/main.ts) prefers its `createServer`:

```bash
node dist/main.js 14
# chapter 14 listening on http://localhost:3000/v1
```

```bash
$ curl -s localhost:3000/healthz
{"status":"ok"}

$ curl -s localhost:3000/nope
{"error":404,"message":"Not Found","info":"the requested resource cannot be found, check the endpoint URL"}

$ curl -s localhost:3000/v1/maintenance -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"countPeople","params":{"country":"IT"}}'
{"jsonrpc":"2.0","result":2,"id":1}

$ curl -s 'localhost:3000/v1/people?limit=1' | jq -c
[{"_id":"6a7440b3…","name":"Ada Lovelace","country":"GB","tags":[{"name":"maths"},{"name":"pioneer"}]}]

$ curl -s 'localhost:3000/v1/people?limit=1' -H 'x-admin: 1' | jq -c
[{"_id":"6a7440b3…","name":"Ada Lovelace","email":"ada@example.com","age":36,"country":"GB","tags":[…],"created":"2026-08-06T…"}]
```

## What just happened

### `attach` versus `listen`

`api.listen(port)` builds a server and mounts the API at the root — which is what the other thirteen chapters
used, and why their URLs have no prefix. `api.attach(app)` mounts it on an app you own, under `/v<major>`
derived from the document version:

```bash
$ curl -s localhost:3000/v1/openapi.json | jq -c '.servers'
[{"url":"http://localhost:3000/v1"}]
```

The `servers` entry is built from the request, including the mount point, so a client generated from the
document targets the right base path with no configuration. Behind a proxy, `x-forwarded-proto` and `host` are
honoured — set `app.set('trust proxy', …)` and the document tells the truth about the public URL rather than
about the container's.

Version the *major* only, and change it when you break something. Mounting `/v1` and `/v2` of the same service
is two `API` instances on one app, which is why `attach` takes a router.

### The catch-all, and a trap in it

`API.handle404Error` is the obvious handler for the last `app.use`, and it is the wrong one *there*. Measured:

```bash
$ curl -s localhost:3000/nope        # with app.use(API.handle404Error)
<!DOCTYPE html><html>… TypeError: Cannot read properties of undefined (reading 'warn') …
```

It logs through `req.logger`, which is installed by arrest's own router. Mounted **outside** that router,
`req.logger` is undefined, the handler throws, and Express turns your 404 into an HTML 500. Inside the API's
own path a miss is handled correctly:

```bash
$ curl -s localhost:3000/v1/nope
{"error":404,"message":"Not Found","info":"the requested resource cannot be found, check the endpoint URL"}
```

So for the app-level catch-all, send the same envelope without the logger:

```ts
app.use((_req, res) => {
  RESTError.send(res, 404, 'Not Found', 'the requested resource cannot be found, check the endpoint URL');
});
```

`RESTError.send` is the static that writes arrest's error shape to any response — useful anywhere you need a
consistent error body outside an operation.

### JSON-RPC: the decorator is the whole opt-in

```bash
$ … {"method":"countPeople","params":{"country":"IT"}} → {"jsonrpc":"2.0","result":2,"id":1}
$ … {"method":"reindex"}                               → {"code":-32601,"message":"Unknown method reindex"}
```

`reindex` exists on the class and is unreachable, because [`dispatch`](../reference/rpc.md#dispatch) refuses
anything without `rpc = true` on the function. That is what makes a `JSONRPC` subclass safe to put helper
methods on: `getCustomInfo`, `handler`, `errorHandler` and your own private helpers are all invisible from
outside, and an undecorated method is indistinguishable from a nonexistent one.

The endpoint is an ordinary operation in every other respect. Its `operationId` is `Maintenance.rpc`, and
therefore its scope is too — which in CASL terms is `can('rpc', 'Maintenance')`, the line in the ability above.
Drop that line and every call is a `403`, delivered as a **plain HTTP error** rather than a JSON-RPC one,
because the security validator runs before the JSON-RPC envelope is parsed. That layering is deliberate: a
client needs to see the 401 or 403 to know it has to authenticate.

Two more measured details worth knowing before you ship one:

```bash
$ curl -s … -d 'not json'                        → {"jsonrpc":"2.0","error":{"code":-32000,"message":"server error"},"id":null}
$ curl -s … -d '{"method":"countPeople"}'        → {"jsonrpc":"2.0","error":{"code":-32000,"message":"server error"},"id":null}
$ curl -si … -d '{"jsonrpc":"2.0","method":"countPeople"}'   → HTTP 200, empty body
```

A malformed body and a missing `jsonrpc` both come back as `-32000 server error` rather than the `-32700`/
`-32600` the specification names — the request body schema rejects them before the JSON-RPC layer sees them,
and `errorHandler`'s fallback is `-32000`. If a client of yours needs standard codes, override `errorHandler`.
The third line is a **notification**: no `id` means no reply, acknowledged with a bare `200` (MCP overrides that
to `202`).

### The ability now governs four different things

One `defineAbility` call, and everything downstream follows from it:

| Rule | Effect |
|---|---|
| `can(['query','read','statistics'], 'Person', […fields])` | those three tools/endpoints, those four fields |
| *(no `create`/`update`/`patch`/`remove`)* | `DELETE /people/:id` → `403`; no write tools in `tools/list` |
| `can(['default','catalogue'], 'MCP')` | `POST /mcp` and `GET /mcp` reachable; `POST /mcp/reporting` → `403` |
| `can('rpc', 'Maintenance')` | the JSON-RPC endpoint reachable |

The MCP scopes are the ones people miss. Each bundle is an operation of the MCP resource, so `MCP.default` and
`MCP.reporting` are separate grants — and the catalogue is an operation too, so `GET /mcp` needs `MCP.catalogue`
independently. Measured:

```bash
$ curl -s localhost:3000/v1/mcp | jq -c
[{"id":"default","url":"http://localhost:3000/v1/mcp","tools":["person_query","person_read"]}]

$ curl -s localhost:3000/v1/mcp -H 'x-admin: 1' | jq -c '[.[]|{id,tools}]'
[{"id":"default","tools":["person_query","person_create","person_read","person_update","person_patch"]},
 {"id":"reporting","tools":["person_statistics","person_create","person_read","person_update","person_patch"]}]

$ curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/v1/mcp/reporting \
    -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
403
```

The non-admin catalogue holds one bundle with two tools — the reporting bundle is not advertised because its
endpoint would refuse, and the write tools are absent because their operations would. And the field rules reach
through MCP as well, since a tool call is a request:

```bash
$ … tools/call person_query {"limit":1}
[{"_id":"6a7440b3…","name":"Ada Lovelace","country":"GB","tags":[{"name":"maths"},{"name":"pioneer"}]}]
```

No `email`, no `age`. One declaration, enforced over REST, in the OpenAPI document, in the MCP catalogue, in
`tools/list` and in tool results.

The filtered document agrees, as it must — same decision, three readers:

```bash
$ curl -s 'localhost:3000/v1/openapi.json?filter=authorized' | jq -r '.paths|to_entries[]|"\(.key)\t\(.value|keys|join(","))"'
/people/statistics  get
/people             get
/people/{id}        get
/maintenance        post
/mcp                get,post
/schemas/{id}       get
```

`/mcp/reporting` is gone, `/people` has lost its `post`, `/people/{id}` its `put`, `patch` and `delete`.

### `initSecurity` is also where pre-operation middleware goes

```ts
const tenant = req.headers['x-tenant'];
if (typeof tenant === 'string') {
  (req as any).tenant = tenant;
}
```

`initSecurity` is registered first in the API's router, ahead of every resource, so anything that must run
before an operation — tenant resolution, request tagging, a correlation id — can live there. Operations then
constrain their queries by it:

```ts
class TenantQuery extends QueryMongoOperation {
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    await super.prepareQuery(job);                                    // keep ability constraints and q
    job.query = addConstraint(job.query, { tenant: (job.req as any).tenant });
    return job;
  }
}
```

Two things to get right, both of which chapter 12 measured the consequences of: call `super.prepareQuery`
first, and merge with [`addConstraint`](../reference/utilities.md#addconstraint) rather than assigning — the
query may be an aggregation pipeline, and assigning drops the ability constraints silently while every test you
run as an admin keeps passing.

The alternative to a per-operation constraint is a *record condition in the ability* —
`can('query', 'Person', { tenant: claims.tenant })` — which needs no operation subclass at all. Prefer it when
the tenant comes from the credential. Reach for `prepareQuery` when the constraint isn't about the caller:
soft-delete flags, archival windows, anything structural.

### What to throw away from this tutorial

Everything the chapters did for convenience, in one list:

| The tutorial does | Production does |
|---|---|
| `?scope=` / `?role=` / `x-admin` in the request | verify a signed token; build the credential from **claims already in it**, never a database read per request |
| `defineAbility` inline in `initSecurity` | a pure `abilityFor(claims)` function, unit-tested without an HTTP server |
| the default `initSecurity` in chapters 01–10 | always override it — the default grants `*` and only says so under `DEBUG=arrest*` |
| `api.listen()` | `api.attach(app)`, so the probe, metrics and catch-all are yours |
| `getDb()` on a fixed URI | a connection string from the environment, and a `MongoClient` you close on `SIGTERM` |
| seeding on boot | migrations, and `createIndexes` on deploy rather than on every start |

The credential rule is the one with teeth. `initSecurity` runs on **every** request, `openapi.json` included, so
a database read there is a per-request round trip on your hottest path.

### Testing

The framework's own tests are the model: [supertest](https://github.com/ladjs/supertest) against
`await api.router()`, with [mongodoki](https://github.com/vivocha/mongodoki) starting a real MongoDB in Docker.

```ts
const md = new Mongodoki({ reuse: true } as DokiConfiguration);

before(async function () {
  this.timeout(0);
  await md.getDB('local');
});

it('should refuse a write to a non-admin', async function () {
  const api = await createApi();
  const router = await api.router();
  const app = express().use(router);

  await supertest(app).post('/people').send({ name: 'X', email: 'x@example.com' }).expect(403);
});
```

Three things this shape buys you. `router()` is memoized, so calling it in a test is calling exactly what
production serves. `reuse: true` keeps one container across runs, which is the difference between a test suite
you run on every save and one you avoid. And because authorization is decided by `initSecurity`, a test that
sets a header — or stubs the token verifier — covers the *whole* consequence of a rule: the REST refusal, the
absence from the filtered document, and the absence from `tools/list`, in one assertion each.

Test the ability rules as a pure function too, separately and without a server. That is where the mistakes
are.

### Dynamic MCP resources

The last piece, and the one this tutorial's app doesn't need: resources that don't exist at boot. One per
tenant, per customer-defined data model, per plugin. `MCPResource` can't discover them — only the request says
which exist and which this caller may see — so
[`DynamicToolProvider`](../reference/mcp.md#dynamictoolprovider) inverts it:

```ts
class TenantToolProvider extends DynamicToolProvider {
  protected async getProviders(req: APIRequest): Promise<MCPProvider[]> {
    const models = await loadModelsVisibleTo(req);
    return Promise.all(
      models.map(async (model) => {
        const { resource } = await buildResourceFor(req, model);
        return new ResourceToolProvider(resource, 'custom', {}, {
          bundles: ['custom'],
          operations: ['query', 'read'],
          toolNamePrefix: `custom_${model.id}`,        // → custom_<id>_query, custom_<id>_read
        });
      })
    );
  }
}

mcp.addProvider('custom', new TenantToolProvider());
```

`toolNamePrefix` is what keeps names distinct when every tenant's resource is called the same thing. Override
`findProvider` when the tool name alone identifies the provider, so a single call builds one resource instead of
all of them — it is memoized per request in a `WeakMap`, so the `hasTool`/`callTool` pair one call performs
resolves once and nothing survives the request. And the resource you build must belong to an API whose
`router()` has been awaited, since that is what `dispatchInternal` dispatches through.

## Where to go from here

You have built, over fourteen chapters, an API with CRUD, validation, RQL querying, custom operations, custom
resources, pipeline extensions, scope and ability authorization, an MCP server and a JSON-RPC endpoint. What is
left is depth:

- [the guide](../guide/) for the reasoning behind each subsystem — start with
  [the security model](../guide/06-security-model.md) and
  [the OpenAPI document](../guide/04-openapi-document.md);
- [the reference](../reference/) for the complete surface, page per module;
- the framework's own [test suite](../../test/ts/), which is the most exhaustive set of arrest examples that
  exists and is checked against 100% coverage — if you wonder whether something is supported, it is answered
  there.

## Exercises

1. Delete `can('rpc', 'Maintenance')` and call `countPeople`. Why is the reply not a JSON-RPC error?
2. Replace `app.use((_req, res) => …)` with `app.use(API.handle404Error)` and request `/nope`. Read the stack.
3. Grant `MCP.reporting` to the non-admin and re-read `GET /mcp`. Which tools appeared, and which operation's
   scope decided each?
4. Move the field list out of `initSecurity` into an `abilityFor(claims)` function and write two unit tests
   against it, with no server.
5. Add a `tenant` condition to the non-admin's `Person` rule and confirm `Results-Matching` changes. Then do it
   with `prepareQuery` instead — which would you rather maintain?

---

[← Chapter 13](13-mcp.md) · [Tutorial index](README.md) · [Manual index →](../README.md)
