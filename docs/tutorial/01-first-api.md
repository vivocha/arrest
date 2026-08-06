# 01 — Your first API

**Goal:** a running server with one endpoint, and an OpenAPI document that describes it without you writing
any OpenAPI.

## The code

[examples/tutorial/src/steps/01-first-api.ts](../../examples/tutorial/src/steps/01-first-api.ts):

```ts
import { API, APIRequest, APIResponse, Resource } from 'arrest';

export async function createApi(): Promise<API> {
  const api = new API({
    title: 'Tutorial API',
    version: '1.0.0',
    description: 'The API we build over the course of the arrest tutorial',
  });

  api.addResource(
    new Resource(
      { name: 'Greeting', namePlural: 'Greetings' },
      {
        '/': {
          get: (req: APIRequest, res: APIResponse) => {
            res.json({ message: 'Hello from arrest' });
          },
        },
      }
    )
  );

  return api;
}
```

The runner then does:

```ts
await api.listen(3000);
```

Three things, and that's the whole program: describe the API, add a resource, listen.

## Run it

```bash
node dist/main.js 01
```

```bash
$ curl localhost:3000/greetings
{"message":"Hello from arrest"}
```

Now the interesting part:

```bash
$ curl -s localhost:3000/openapi.json
```

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Tutorial API",
    "version": "1.0.0",
    "description": "The API we build over the course of the arrest tutorial"
  },
  "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
  "components": { "schemas": { "errorResponse": { … } }, "responses": { … }, "parameters": { … } },
  "paths": {
    "/greetings": {
      "get": {
        "operationId": "Greeting.get",
        "tags": ["Greeting"],
        "responses": { "default": { "$ref": "#/components/responses/defaultError" } }
      }
    },
    "/schemas/{id}": { "get": { … } }
  },
  "tags": [{ "name": "Greeting" }, { "name": "Schema" }],
  "servers": [{ "url": "http://localhost:3000" }]
}
```

## What just happened

### `new API(info)`

The argument is the OpenAPI [Info object](https://spec.openapis.org/oas/v3.1.0#info-object) — `title` and
`version` are required by the specification and by arrest. It is merged into a
[default document](../reference/defaults.md) that already contains an `errorResponse` schema, the
`defaultError` and `notFound` responses, and a reusable `id` path parameter. Those are the pieces every
operation arrest generates refers to, which is why you never declare an error response by hand.

One trap worth learning now, because it costs people an afternoon later: **only `info` is taken from that
argument.** Passing `components` to the constructor puts your components at `info.components`, where nothing
reads them. Security schemes in particular have to be assigned to the document after construction — chapter 11
does exactly that.

### `namePlural` became the path

`Greetings`, decamelized, is `/greetings`. Not `namePlural`? arrest appends an `s` to `name`, so
`{ name: 'Person' }` alone would serve `/persons`. Set `namePlural` unless the naive plural happens to be
right. And `{ name: 'BlogPost', namePlural: 'BlogPosts' }` gives `/blog-posts`, not `/blogposts` — the
decamelization inserts a hyphen at each case change.

### A function became an operation

The route table's `get` is an ordinary Express handler. arrest wrapped it in a
[`SimpleOperation`](../reference/operation.md#simpleoperation), which is an `Operation` whose `handler` is the
function you gave. Which is why it has an `operationId` of `Greeting.get`, a tag, and a `default` error
response in the document: it is a first-class operation, not an escape hatch.

`Greeting.get` is `<resource name>.<internal id>`, and the internal id came from the path and method: `/` plus
`get`. That id is not cosmetic — it becomes the OAuth2 scope name in chapter 11 and the MCP tool name in
chapter 13, so operations you intend to keep deserve an explicit id. Chapter 08 shows how to give one.

### `/schemas/{id}` and the `Schema` tag

You didn't add that. arrest adds a [`SchemaResource`](../reference/schemas.md#schemaresource) whenever
`components.schemas` is non-empty when the router is built — and the default document's `errorResponse` is
already enough to trigger it. It serves registered schemas by name, which becomes useful in chapter 04.

Note that it serves the *registered* schemas, the ones you pass to `registerSchema`. `errorResponse` gets there
by a different route, so `GET /schemas/errorResponse` is a 404 in this chapter. Chapter 04 has a schema that
actually resolves.

### `servers` was computed

You didn't write `servers` either. arrest fills it in from the incoming request, so the document served on
`localhost:3000` says `localhost:3000` and the same code behind a proxy on `https://api.example.com` says that.
A client generated from the document targets the right host with no configuration, which is the point.

### Two error responses you didn't ask for

```bash
$ curl -i -X POST localhost:3000/greetings
HTTP/1.1 405 Method Not Allowed
{"error":405,"message":"Method Not Allowed","info":"The API Endpoint doesn't support the specified HTTP method for the given resource"}

$ curl -i localhost:3000/nope
HTTP/1.1 404 Not Found
{"error":404,"message":"Not Found","info":"the requested resource cannot be found, check the endpoint URL"}
```

The 405 comes from a catch-all arrest registers *after* every operation, on every path a resource owns: a known
path with an unhandled method is a 405, not a 404. The 404 comes from `API.handle404Error`, which `listen`
installs — chapter 14 covers what happens to it when you mount into an app of your own.

Both bodies have the same three-field shape, `{ error, message, info }`, which is
[`errorResponse`](../reference/defaults.md#responses) from the default document. Every error arrest
produces looks like this.

## Exercises

1. Drop `namePlural` and see what the path becomes.
2. Add `{ name: 'Health', path: 'health' }` and confirm the path is `/health`, not `/healths`.
3. `curl -s localhost:3000/openapi.json | jq '.paths'` — how much of that did you write?
4. Return something non-serializable from the handler (a `BigInt`, say) and see which of arrest's error paths
   catches it.

---

[← Chapter 00](00-setting-up.md) · [Tutorial index](README.md) · [Chapter 02 →](02-resources-and-operations.md)
