# 13 — Serving an MCP server

**Goal:** expose part of the API as tools an AI agent can call, deliberately — knowing exactly what a model sees,
and why it is a subset of what the API offers.

[MCP](https://modelcontextprotocol.io) is JSON-RPC 2.0 over HTTP, and arrest already speaks JSON-RPC (chapter 14
covers [`JSONRPC`](../reference/rpc.md) on its own). So the MCP server is native: no extra dependency, and a tool
call is performed by **re-dispatching a request through the API's own router**, not by a second code path. That
one design decision is why the rest of this chapter is mostly about *choosing what to publish* rather than about
security plumbing.

## The code

Two pieces. First the opt-in, in
[examples/tutorial/src/resources/mcp-person.ts](../../examples/tutorial/src/resources/mcp-person.ts) — a subclass
of the `PersonResource` the earlier chapters use, so that resource stays MCP-free:

```ts
export class McpPersonResource extends PersonResource {
  constructor(db: Db, routes?: MongoRoutes) {
    super(db, routes);
    this.info.mcp = {
      bundles: ['default', 'reporting'],
      operations: ['query', 'read', 'create', 'update', 'patch', 'statistics'],
      tools: {
        query: {
          description:
            'Search people. `q` takes an RQL filter, e.g. q=eq(country,IT) or q=and(gt(age,40),eq(country,GB)). ' +
            'Returns at most 50 records; use skip to page.',
          omitParameters: ['format', 'csv_fields', 'csv_names', 'csv_options'],
          bundles: ['default'],
        },
        statistics: { bundles: ['reporting'] },
      },
    };
  }
}
```

Then the server itself, in
[examples/tutorial/src/steps/13-mcp.ts](../../examples/tutorial/src/steps/13-mcp.ts):

```ts
api.addResource(new McpPersonResource(db, { '/statistics': { get: PersonStatisticsOperation }, ...MongoResource.defaultRoutes() }));
api.addResource(new TokenResource());          // not opted in — invisible to every agent

api.addResource(
  new MCPResource({
    bundles: {
      default: {
        title: 'People',
        description: 'Look people up and keep their records current',
        instructions: 'Use person_query to find people; ids are 24-character hex strings. Prefer q= filters over fetching everything.',
      },
      reporting: {
        title: 'Reporting',
        description: 'Aggregate statistics over the people collection',
        maxOutputChars: 20000,
      },
    },
  })
);
```

## Run it

```bash
node dist/main.js 13
```

No MCP client needed — it is a JSON-RPC `POST`:

```bash
$ curl -s localhost:3000/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' | jq -c '.result'
{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},
 "serverInfo":{"name":"Tutorial API","version":"1.0.0","title":"People"},
 "instructions":"Use person_query to find people; ids are 24-character hex strings. Prefer q= filters over fetching everything."}

$ curl -s localhost:3000/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq -c '.result.tools|map(.name)'
["person_query","person_create","person_read","person_update","person_patch"]

$ curl -s localhost:3000/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"person_query","arguments":{"limit":2,"fields":["name","country"]}}}' | jq -c '.result'
{"content":[{"type":"text","text":"[\n  {\n    \"name\": \"Ada Lovelace\",\n    \"country\": \"GB\"\n  },\n  {\n    \"name\": \"Alan Turing\",\n    \"country\": \"GB\"\n  }\n]"},
            {"type":"text","text":"8 items match the query"}]}
```

`serverInfo` came from the document's `info` plus the bundle's `title`; `capabilities` advertises `tools` only,
because the providers implement `listTools` and nothing else. `instructions` is the bundle's — a good place for
the two or three facts a model needs and cannot infer, like the shape of an id.

## What just happened

### Nothing is exposed unless it opts in

`TokenResource` is in the API, serves two operations, and appears in no tool list. The only opt-in is `mcp` in
the resource definition, so a resource added next month is invisible to agents until someone says otherwise.

That default is the point. The failure mode of the opposite default is publishing the delete endpoint nobody
meant to publish, to a caller that will try things.

The shorthand `mcp: true` means "every operation, default bundle". Measured on the same resource with nothing
else set:

```
["person_query","person_create","person_read","person_update","person_remove","person_patch"]
```

Six tools, `person_remove` among them. Convenient for a scratch API; for anything else, name the operations.

### Bundles: several small tool sets, not one big one

A bundle is a named group with its own endpoint, its own scope and its own `maxOutputChars`:

```
POST /mcp             the default bundle
POST /mcp/reporting   the reporting bundle
GET  /mcp             the catalogue
```

```bash
$ curl -s localhost:3000/mcp | jq -c '.'
[{"id":"default","title":"People","description":"Look people up and keep their records current",
  "url":"http://localhost:3000/mcp",
  "tools":["person_query","person_create","person_read","person_update","person_patch"]},
 {"id":"reporting","title":"Reporting","description":"Aggregate statistics over the people collection",
  "url":"http://localhost:3000/mcp/reporting",
  "tools":["person_statistics","person_create","person_read","person_update","person_patch"]}]
```

Two reasons to split, and the second is the one that surprises people:

1. **A model given forty tools chooses badly.** Tool selection degrades with list length long before any
   context limit is reached. Bundles are how you keep each list to the handful a model can actually reason
   about.
2. **Each bundle is separately grantable.** The endpoints are ordinary arrest operations, so they have ordinary
   scopes — `MCP.default`, `MCP.reporting`, and `MCP.catalogue` for the `GET`. A token can hold one and not the
   other.

Note `person_create`, `person_read`, `person_update` and `person_patch` in *both* lists. The resource declares
`bundles: ['default', 'reporting']`, and a tool without its own `bundles` appears in every bundle the resource
belongs to. Only `query` and `statistics` narrowed themselves. Being explicit per tool is usually what you want:
`bundles` on the resource is the set it *may* appear in, not a distribution.

A bundle named `default` sits at the resource root; the others at `/<id>`. Drop the catalogue with
`catalogue: false`.

### The `operations` whitelist, and what it prevents

```ts
operations: ['query', 'read', 'create', 'update', 'patch', 'statistics'],
```

Keyed by [`Operation.internalId`](../reference/operation.md#constructor) — `'query'`, `'read'`, not the tool
name. `remove` is absent, so there is no tool a model can call to delete a person; and the whitelist means the
*next* operation added to this resource is not published by accident either. Absent, every operation is a
candidate.

`tools: { update: false }` hides one operation without rewriting the whitelist. Both mechanisms are checked by
`ResourceToolProvider.isSelected`, along with the bundle test.

### The tool a model actually sees

```bash
$ curl -s localhost:3000/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[]|select(.name=="person_query")'
```

```json
{
  "name": "person_query",
  "description": "Search people. `q` takes an RQL filter, e.g. q=eq(country,IT) or q=and(gt(age,40),eq(country,GB)). Returns at most 50 records; use skip to page.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Maximum number of items to return" },
      "skip":  { "type": "integer", "minimum": 0, "description": "Skip the specified number of items" },
      "fields": { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "description": "Return only the specified properties" },
      "sort":  { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "description": "Sorting criteria, using RQL syntax (a,-b,+c)" },
      "q":     { "type": "string", "description": "Return only items matching the specified [RQL](https://github.com/persvr/rql) query…" }
    }
  },
  "annotations": { "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true }
}
```

Four things to read out of that.

**The name** is `toolNameFor(resourceName, internalId)`: both halves decamelized with `_`, invalid characters
collapsed, capped at 128 characters. `Person` + `query` → `person_query`. Override it with `name` in the tool
info when you need something a model reads better (`search_people`).

**The description** is the highest-leverage field on this page. Ours is explicit and carries examples; the
default is the operation's `summary`, then its `description`, then `Execute <operationId>`. Compare
`person_read`, which has no custom description:

```
"description": "Retrieve a Person by id"
```

Adequate. But a model choosing between `person_query` and `person_read` decides on these strings alone, and
`q` syntax is not something it can guess. Write descriptions for the model, not for the reader of the OpenAPI
document — they are different audiences and arrest lets them have different text.

**`omitParameters` did its job**: `format`, `csv_fields`, `csv_names` and `csv_options` are gone. They are
machine-facing knobs for an HTTP client; a model that discovers `format=csv` will use it and then reason over a
CSV string. Omit anything a model has no business setting — including parameters supplied by upstream
middleware, like a tenant header.

**The annotations** came from the HTTP method, via `annotationsFor`:

| Tool | method | `readOnlyHint` | `destructiveHint` | `idempotentHint` |
|---|---|---|---|---|
| `person_query` | `get` | `true` | `false` | `true` |
| `person_read` | `get` | `true` | `false` | `true` |
| `person_create` | `post` | `false` | `false` | `false` |
| `person_update` | `put` | `false` | `false` | `true` |
| `person_patch` | `patch` | `false` | `false` | `false` |
| `person_remove` | `delete` | `false` | **`true`** | `true` |

These are **hints**, not a boundary. A client uses them to decide whether a call needs a human's confirmation.
Nothing about `readOnlyHint: true` prevents the operation from writing; if you need that guarantee, don't
publish the tool.

### The body arrives as one argument

A tool has a flat argument list and an HTTP request has a body, so arrest puts the whole body in an argument
named `body`:

```bash
$ curl -s localhost:3000/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq -c '.result.tools[]|select(.name=="person_create")|.inputSchema|{required,props:(.properties|keys)}'
{"required":["body"],"props":["body"]}
```

Everything else is routed by the operation's own parameter definitions: `in: 'path'` becomes a path parameter,
`in: 'header'` a header, and anything else — including an argument the operation never declared — goes into the
query string, where the operation's validators get to reject it. Values are passed through **uncoerced** on
purpose: the operation's `ParameterObject` validators are the single source of truth, and a tool call must not
be able to anticipate them.

`PATCH` works over MCP, which is worth stating because it easily wouldn't have:

```bash
$ curl -s localhost:3000/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"person_patch","arguments":{"id":"6a7440b3…","body":[{"op":"replace","path":"/age","value":37}]}}}'
```

and the generated `inputSchema` for `body` is the same three-shape `oneOf` chapter 06 described — value ops,
`move`, `remove`. It works because [`PatchMongoOperation`](../reference/mongo-operations.md#patchmongooperation)
declares its body as `application/json`. A hand-written operation using
`application/json-patch+json` would get **no `body` argument at all**: the schema derivation reads
`application/json` and `application/x-www-form-urlencoded`, and nothing else. Same for a resource whose media
type is `text/plain` or `multipart/form-data`.

### Output schemas, and `$defs`

`person_read` carries an `outputSchema`; `person_query` does not:

```json
{
  "type": "object",
  "allOf": [{ "$ref": "#/$defs/person" }],
  "$defs": {
    "person":     { "type": "object", "required": ["name","email"], "properties": { … } },
    "objectId":   { "type": "string", … },
    "person_tag": { "type": "object", "required": ["name"], … }
  }
}
```

Two mechanisms visible here.

**Only objects get an output schema.** MCP requires structured content to be a JSON object, so an operation
whose 2xx response is an *array* — every query operation — reports its result as text only. That is why a
`person_read` result carries `structuredContent` and a `person_query` result doesn't:

```bash
$ … person_read  → {"content":[{"type":"text","text":"{…}"}],"structuredContent":{"name":"Ada Lovelace","country":"GB"}}
$ … person_query → {"content":[{"type":"text","text":"[…]"},{"type":"text","text":"8 items match the query"}]}
```

**Referenced schemas are bundled into `$defs`, not inlined.** Every `#/components/schemas/X` the tool schema
depends on is copied in transitively and the refs rewritten to `#/$defs/X` — which is why `person_tag` and
`objectId` are there even though the tool only names `person`. Bundling rather than inlining is not a style
choice: arrest schemas are frequently recursive (a category with subcategories, a comment with replies), and
inlining one would not terminate.

The schemas come from the **unresolved** snapshot of the document,
[`getOriginalDocument`](../reference/api.md#getoriginaldocument) — the version whose `$ref`s are still strings.
The served document has been through jsonref and has real object references in it, which `JSON.stringify` would
choke on.

### That second text block

```
{"type":"text","text":"8 items match the query"}
```

`Results-Matching` and `Results-Skipped` are HTTP headers, and a model never sees headers. So the provider
turns them into a sentence: `getResultMetadata` reports the match count, the skip count when non-zero, and
`more items are available: repeat the call increasing skip` when arrest emitted a `Link` header. Without this a
model receiving 50 records has no way to know there were 4,000.

### Errors: two kinds, deliberately

A failure of the *operation* is a tool result the model can read and act on:

```bash
$ … person_read {"id":"000000000000000000000000"}
{"content":[{"type":"text","text":"The operation failed with status 404: {\n  \"error\": 404,\n  \"message\": \"not_found\"\n}"}],"isError":true}

$ … person_create {"body":{"name":"X"}}
{"content":[{"type":"text","text":"The operation failed with status 400: {\n  \"error\": 400,\n  \"message\": \"ValidationError\",\n  \"info\": {\n    \"type\": \"required\",\n    \"path\": \"body/email\",\n    \"scope\": \"…/components/schemas/person\"\n  }\n}"}],"isError":true}
```

Note what the second one proves: the request went through the operation's body validator. Nothing about the MCP
path skips validation, because the call *is* a request — see below. And the model gets told which field it
missed, in its own result, so it can fix the call itself.

A failure of the *protocol* is a JSON-RPC error, because the model can't fix it:

```bash
$ … tools/call {"name":"person_remove"}  → {"code":-32602,"message":"Unknown tool person_remove"}
$ … {"method":"resources/list"}          → {"code":-32601,"message":"Unknown method resources/list"}
$ … [{"jsonrpc":"2.0","id":1,…}]         → {"code":-32600,"message":"Invalid request"}   (batches are not accepted)
$ POST /mcp/nope                         → HTTP 404 Not Found
```

And an *authentication* failure is a plain HTTP status, not a JSON-RPC error, so a client can see it needs a
different token. Three layers, three error models, each aimed at whoever can do something about it.

### The tool list is the caller's, not the API's

Adding real scopes to this chapter's API (the chapter 11 `initSecurity`, unchanged) and asking for
`tools/list` with different grants:

| `?scope=` | Response |
|---|---|
| `*` | `["person_query","person_create","person_read","person_update","person_patch"]` |
| `MCP,Person.query,Person.read` | `["person_query","person_read"]` |
| `MCP.default,Person.query` | `["person_query"]` |
| `Person.query` | `403 insufficient privileges` — no scope for the endpoint itself |
| *(none)* | `401 no scope` |

And the catalogue narrows the same way — `MCP.catalogue,MCP.reporting,Person.statistics` returns one bundle
holding one tool:

```json
[{"id":"reporting","tools":["person_statistics"]}]
```

Two levels, and they are independent: the **bundle scope** decides whether you may talk to the endpoint at all,
and each **operation's own scope** decides whether its tool appears in the list. `Person.query` alone gets a
403 from the endpoint before any tool is considered.

The filtering is [`Operation.isAuthorized`](../reference/operation.md#isauthorized), which is
`getAuthorizationError` again — the same method `securityValidator` enforces and `?filter=authorized` reports
with. So `tools/list` cannot advertise a tool the API would then refuse, by construction rather than by
maintenance. A custom check belongs in that one method: override `securityValidator` instead and `tools/list`
will happily offer a tool your validator rejects.

Calling a tool that was filtered out:

```bash
$ … tools/call {"name":"person_create"}  with ?scope=MCP.default,Person.query
{"code":-32602,"message":"Unknown tool person_create"}
```

Refused because no provider admits to owning it. But **hiding is not the enforcement** — if it somehow got
through, the operation's own validator would refuse it. The filtering exists so a model isn't offered tools it
can't use.

### Why a tool call is exactly a REST call

[`dispatchInternal`](../reference/mcp.md#dispatchinternal) builds a sub-request with
`Object.create(parentReq)` — so it inherits, through the prototype chain, everything upstream middleware
attached to the original: `logger`, `scopes`, `ability`, `user`, session, your tenant — and hands it to
`await api.router()`.

The consequence is the thing to remember from this chapter: **the security validator, the parameter validators,
the body validator, the handler, the error handler and CASL field redaction all apply to a tool call, because
it is a request.** An agent hitting `person_query` under an ability that restricts records to one country gets
the same five people chapter 12 measured over HTTP. There is no second code path to keep in sync, because there
is no second code path.

It is also not MCP-specific. Use it for any internal call that should be authorized as the caller.

### Truncation

A single text block longer than the bundle's `maxOutputChars` (default 100,000) is cut, with a note aimed at
the model. Measured with `maxOutputChars: 200`:

```
"[\n  {\n    \"name\": \"Ada Lovelace\"\n  },\n … {\n  \n\n[output truncated at 200 characters; narrow the request with the limit, fields or q arguments]"
```

The alternative is worse: hosted MCP clients typically offload anything large to a file, and a model that has
to open a file has lost the ability to reason over the data inline. Better to cut it and say how to ask for
less. Note the second content block (`8 items match the query`) is untouched — the limit is per block — and that
truncation applies to every provider's results, so a bundle's output limit is a property of the endpoint.

### Dynamic resources

Everything above assumes the resources exist when the API starts. When they don't — one resource per tenant, per
customer-defined data model, per plugin — `MCPResource` cannot discover them, because only the request says
which exist and which this caller may see. That is what
[`DynamicToolProvider`](../reference/mcp.md#dynamictoolprovider) is for: implement `getProviders(req)`, register
it with `mcpResource.addProvider('default', provider)`, and it aggregates and routes calls for you. Chapter 14
puts one together.

## Exercises

1. Add `remove` to the `operations` whitelist and look at `person_remove`'s annotations. Would you ship it?
2. Give `person_read` a `description` written for a model, and a `name` of `get_person`. What broke in the
   catalogue?
3. Set `tools: { update: false }` and confirm the tool disappears from both bundles while `PUT /people/:id`
   still works over HTTP.
4. Run chapter 13 with chapter 12's `initSecurity` and call `person_query` as the `reader` role. Which fields
   come back?
5. Set `maxOutputChars: 500` on the default bundle and call `person_query` with no `limit`. Then follow the
   note's advice as a model would.

---

[← Chapter 12](12-abilities.md) · [Tutorial index](README.md) · [Chapter 14 →](14-production.md)
