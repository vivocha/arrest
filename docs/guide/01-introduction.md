# Introduction

arrest is a REST framework for Node.js in which the OpenAPI document is not documentation — it is the
implementation. You declare resources and operations; arrest derives the document from them, and derives the
validation, the authorization and the routing from the same declarations. There is one description of your API
and everything is generated from it.

## The premise

Most frameworks let you write handlers and then, separately, describe them. The two drift: the document says a
field is required and the handler doesn't check, or the handler rejects something the document permits. Every
integration bug lives in that gap.

arrest closes it by making the document the source. An operation's `parameters` become the parameter
validators. Its `requestBody` becomes the body parser and the schema validator. Its `security` becomes the
authorization check. Its `operationId` becomes the OAuth2 scope. Nothing is written twice, so nothing can
disagree.

The consequence worth internalizing: **to change behaviour you change the description.** Adding a query
parameter to an operation's `getCustomInfo` is what makes that parameter validated and available. There is no
second place to update.

## What you get

A three-tier structure — [`API`](../reference/api.md) contains
[`Resource`](../reference/resource.md)s contain [`Operation`](../reference/operation.md)s — and on top of it:

- **OpenAPI 3.1** with the JSON Schema 2020-12 dialect, served at `GET /openapi.json` with `servers` rewritten
  to the URL the caller actually reached.
- **MongoDB CRUD** from one declaration:
  [`new MongoResource(db, { name: 'Person' })`](../reference/mongo-resource.md) is six documented, validated,
  authorized endpoints.
- **RQL** querying — `?q=eq(status,active)&sort=-created&limit=20` — [translated to MongoDB](../reference/rql.md),
  with `$facet` pagination and RFC 5988 `Link` headers.
- **Authorization** on OAuth2 scopes or [CASL abilities](../reference/authorization.md), with one decision
  point that also filters the document and the MCP tool list.
- **An MCP server** ([reference](../reference/mcp.md)): the same operations, exposed as Model Context Protocol
  tools with derived JSON Schemas and the same authorization.
- **JSON-RPC** ([reference](../reference/rpc.md)) for the endpoints that aren't resources.
- **CSV and JSONL** output from any query operation, no extra code.

## What arrest assumes

It is worth being explicit, because these assumptions are why the framework is small.

**Your API is made of resources.** Nouns with a plural, at a base path, with operations on `/` and `/:id`. If
your surface is a set of RPC verbs, arrest can serve it — [`JSONRPC`](../reference/rpc.md) exists for that —
but you won't be using the part that earns its keep.

**Express.** arrest builds an Express `Router`; you mount it. Your existing middleware, error handlers and
process management keep working.

**Authentication is yours.** arrest never decides who a caller is. You attach
[`req.scopes` or `req.ability`](../reference/types.md#apirequest) in
[`initSecurity`](../reference/api.md#initsecurity) from whatever you use — a JWT, a session, a gateway
header — and arrest decides what that caller may do. There is no user model, no login endpoint and no session
store, by design.

**MongoDB, if you want persistence for free.** [`MongoResource`](../reference/mongo-resource.md) is the only
storage integration. Other stores are perfectly serviceable: subclass
[`PipelineOperation`](../reference/pipeline.md) and implement `runOperation`. You lose the generated CRUD, not
the framework.

**The document is assembled at startup.** [`router()`](../reference/api.md#router) resolves every `$ref`,
prunes unused components and builds the middleware chain once. Adding a resource after that has no effect. In
exchange, per-request work is only validation and dispatch.

## When to use it, and when not

It fits when several of these are true: you have more than a handful of resources; the API is consumed by
clients you don't own, so its contract matters; you want generated clients or an accurate Swagger UI; you need
field- or record-level authorization rather than just route guards; and you'd like your endpoints available to
an LLM without writing a second server.

It fits badly when your API is a handful of endpoints — the setup outweighs the generation — or when the
response shapes are freeform enough that describing them buys nothing, or when you're already committed to a
framework with its own conventions. arrest is a whole way of structuring an API, not a library you add to one.

## A first look

The smallest thing that shows the point:

```ts
import { API, MongoResource } from 'arrest';

const api = new API({ title: 'People', version: '1.0.0' });

api.addResource(new MongoResource('mongodb://localhost:27017/test', { name: 'Person', namePlural: 'People' }));

await api.listen(3000);
```

That is a complete server. `GET /people?q=eq(name,Alice)&limit=10`, `POST /people`, `GET /people/:id`,
`PUT`/`PATCH`/`DELETE /people/:id`, and `GET /openapi.json` describing all six accurately, because the
description is what produced them.

The rest of this guide is about how that works and where you intervene. When you want to build rather than
read, go to the [tutorial](../tutorial/00-setting-up.md) — same material, hands on.

## A note on names

The framework is `arrest`, lowercase. The npm package is
[`arrest`](https://www.npmjs.com/package/arrest). It has been in production at
[Vivocha](https://www.vivocha.com) since 2016; the OpenAPI 3.1 and MCP support are recent, the three-tier
structure is not.

---

[Manual index](../README.md) · [Installation →](02-installation.md)
