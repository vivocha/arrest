# Schemas

Sources: [src/api.ts](../../src/api.ts), [src/util.ts](../../src/util.ts), [src/schema.ts](../../src/schema.ts)

arrest validates requests and documents responses with JSON Schema. Schemas are registered by name on the
[`API`](api.md), referenced by name from operations and resources, and served over HTTP so clients can fetch
them. This page covers registration, the `$ref` rewriting that makes plain names work, and the endpoint that
serves them.

The document declares `jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema'` — see
[defaults.md](defaults.md).

## Registering a schema

```ts
api.registerSchema('person', {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    surname: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
  },
  required: ['name', 'surname'],
  additionalProperties: false,
});
```

[`registerSchema`](api.md#registerschema) does three things:

1. deep-clones the schema into `api.originalSchemas[name]` — untouched, exactly as you passed it;
2. rebases every `$ref` in a second clone (see [below](#ref-rebasing));
3. strips `$schema` with [`removeSchemaDeclaration`](utilities.md#removeschemadeclaration) and stores the
   result at `components.schemas[name]`.

Registering the same name twice replaces both copies. There is no `unregisterSchema`.

Once registered, refer to it by name from anywhere in the document:

```ts
class PersonResource extends MongoResource {
  get schema() {
    return { $ref: 'person' };
  }
}
```

`{ $ref: 'person' }` inside a *schema you register* is rebased to `#/components/schemas/person`. A `$ref` you
write **directly into the document** — in an operation's `getCustomInfo`, say — is not rebased and must be
written in full: `{ $ref: '#/components/schemas/person' }`.

Schemas nobody references are dropped from the served document by
[`removeUnusedSchemas`](#removeunusedschemas), so registering a library of schemas costs nothing in the output.

## `$ref` rebasing

Source: [`refsRebaser`](../../src/util.ts)

JSON Schema and OpenAPI disagree about where definitions live: draft-07 style schemas use `definitions` and
refer to siblings as `#/definitions/x`, while OpenAPI puts everything under `#/components/schemas`. arrest
lets you write the former and rewrites it to the latter, so a schema authored as a standalone file works
unchanged.

Given a schema registered as `<name>`:

| Written | Rebased to |
|---|---|
| `#/definitions/<def>` | `#/components/schemas/<name>/definitions/<def>` |
| `<other>#/definitions/<def>` | `#/components/schemas/<other>/definitions/<def>` |
| `#/properties/<prop>` | `#/components/schemas/<name>/properties/<prop>` |
| `<other>#/properties/<prop>` | `#/components/schemas/<other>/properties/<prop>` |
| `<other>#` | `#/components/schemas/<other>` |
| `<other>` | `#/components/schemas/<other>` |

`http:` and `https:` refs are left alone and resolved over the network by
[`defaultSchemaRetriever`](api.md#logging) during parsing.

So this pair of schemas works:

```ts
api.registerSchema('common', {
  type: 'object',
  definitions: { notEmptyString: { type: 'string', minLength: 1 } },
});

api.registerSchema('thing', {
  type: 'object',
  definitions: {
    model: {
      type: 'object',
      properties: {
        name: { $ref: 'common#/definitions/notEmptyString' },  // → another schema's definition
        code: { type: 'integer' },
      },
    },
  },
  properties: {
    model: { $ref: '#/definitions/model' },                    // → this schema's own definition
  },
  required: ['model'],
});
```

Registration order doesn't matter: refs are strings until [`API.router()`](api.md#router) resolves them, so
`thing` may be registered before `common`.

## `rebaseOASDefinitions`

Rebasing rewrites the *pointers*; `rebaseOASDefinitions` moves the *definitions*, because OpenAPI has no
`definitions` keyword. Inside `router()`, every nested `definitions` object is hoisted to
`components.schemas` under an underscore-joined name recording where it came from, and every `$ref` pointing
at the old location is rewritten.

The pair above ends up as:

```
components.schemas.common
components.schemas.thing
components.schemas.common_notEmptyString
components.schemas.thing_model
```

with `thing.properties.model.$ref` pointing at `#/components/schemas/thing_model`. Nesting deeper produces
longer names — `thing_info_settings` for `thing`'s `info.definitions.settings` — so a deeply nested schema is
still addressable, just verbosely.

Two consequences worth knowing: the names appear in the published document and in client code generated from
it, so they're part of your API surface; and a malformed schema makes the whole step fail with
`Error('Unable to rebase schema definitions, check the Schema.')` at router construction.

## `removeUnusedSchemas`

Also run inside `router()`, and again by
[`filterAuthorizedDocument`](api.md#filterauthorizeddocument). It walks the document counting `$ref`s, then
deletes every entry of `components.schemas` and `components.parameters` nothing points at.

- **Responses are counted but never deleted** — `defaultError` and `notFound` stay in the document even if
  no operation references them.
- A schema referenced only by another schema that is itself unreferenced goes too.
- A `$ref` pointing at something absent is an **error**, not a warning:
  `Error('Error removing unreferenced schemas. …Referenced path "…" doesn't exist in spec.')`. That's the step
  that catches a typo in a schema name, and it fails at `router()` — before serving a request, but also
  before any test that doesn't build the router.

This is why the served document lists only the parameters the API actually uses, out of the nine the default
document declares.

## Dynamic schemas

```ts
api.registerDynamicSchema('tenant-config', new MyComputedSchema());
```

[`registerDynamicSchema`](api.md#registerdynamicschema) takes an openapi-police `SchemaObject` — a class with
an async `spec()` — and defers it. `router()` awaits every `spec()` and passes the result to
`registerSchema`, before the rebasing and cleanup steps, so a dynamic schema behaves exactly like a static one
from then on.

Use it when the schema depends on something you can only read asynchronously: a configuration collection, a
remote registry, a plugin scan. Note it resolves **once**, at router construction — this is not a way to vary
a schema per request. For that, see [`DynamicToolProvider`](mcp.md#dynamictoolprovider) on the MCP side, or
validate in the handler.

## `SchemaResource`

Source: [src/schema.ts](../../src/schema.ts)

A [`Resource`](resource.md) serving `GET /schemas/{id}`, added automatically by `router()` **when at least one
schema is registered**. You never construct it yourself.

Its single operation:

- returns `api.originalSchemas[req.params.id]` — the schema **as you registered it**, with its `$schema` and
  its own `definitions` intact, not the rebased and hoisted version in the document;
- answers `404 not_found` for an unknown name;
- overrides [`swaggerScopes`](operation.md#swaggerscopes) to return `{}`, so it is **public**: no scope, no
  security validator, and never filtered out of `openapi.json?filter=authorized`.

That last point is a deliberate trade: schemas describe shapes, not data, and a client needs them to build
valid requests. If your schemas are themselves sensitive, don't register them — build the schema into the
operation's `info` instead, where the document filter can hide it along with the operation.

The path comes from the resource name `Schema` through the usual pluralization, so it is `/schemas/{id}`
relative to the API base — `/v1/schemas/person` for a v1 API mounted with [`attach`](api.md#attach).

---

[← RQL](rql.md) · [Reference index](README.md) · [Authorization →](authorization.md)
