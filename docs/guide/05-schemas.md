# Schemas

arrest validates with JSON Schema, in the 2020-12 dialect the document declares. There is no separate
validation layer, no decorators on a model class, no DTOs: the schema in the document *is* the validator.

The mechanics — registration, rebasing, pruning, `SchemaResource` — are tabulated in
[reference/schemas.md](../reference/schemas.md). This page is about how to think about them.

## Write the schema once, reference it everywhere

```ts
api.registerSchema('person', {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    created: { type: 'string', format: 'date-time', readOnly: true },
  },
  required: ['name'],
  additionalProperties: false,
});
```

```ts
class PersonResource extends MongoResource {
  get schema() {
    return { $ref: '#/components/schemas/person' };
  }
}
```

The **full pointer**, not `{ $ref: 'person' }`: a `schema` getter is not inside a registered schema, so nothing
rebases it — see the next section. A short ref here is resolved as a URL and `router()` fails trying to fetch it.

That one declaration now drives the `POST` body validator, the `PUT` body validator, the `200` response schema of
all four read paths, the `patch` operation's per-path checks, and the input schema of every MCP tool derived from
the resource. Tighten `minLength` and all of them tighten.

The alternative — an inline schema per operation — works and is occasionally right for a one-off, but you lose
the single point of change and the client generator emits an anonymous type per endpoint.

## The `$ref` you write depends on where you write it

This is the one confusing thing about schemas in arrest, so it is worth stating flatly.

**Inside a schema you pass to `registerSchema`**, a `$ref` is *rebased*: short forms work, and are how you refer
to another registered schema or to your own `definitions`.

```ts
api.registerSchema('order', {
  type: 'object',
  definitions: {
    line: { type: 'object', properties: { sku: { type: 'string' }, qty: { type: 'integer' } } },
  },
  properties: {
    customer: { $ref: 'person' },              // another registered schema
    lines: { type: 'array', items: { $ref: '#/definitions/line' } },  // my own definition
  },
});
```

**Anywhere else in the document** — an operation's `getCustomInfo`, a resource's `schema` getter, a parameter, a
response — nothing rebases, so write the full OpenAPI pointer:

```ts
protected getCustomInfo(): OpenAPIV3.OperationObject {
  return {
    responses: {
      '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/person' } } } },
    },
  };
}
```

The [rebasing table](../reference/schemas.md#ref-rebasing) has all six forms. The rule of thumb: short refs
inside registered schemas, full pointers everywhere else.

Registration order never matters — refs are strings until `router()` resolves them, so `order` can reference
`person` before `person` is registered.

## `definitions` and where they end up

You can author schemas as standalone JSON Schema files, `definitions` and all, and register them as they are.
Inside `router()`, [`rebaseOASDefinitions`](../reference/schemas.md#rebaseoasdefinitions) hoists each nested
`definitions` entry into `components.schemas` under an underscore-joined name:

```
order.definitions.line   →   components.schemas.order_line
```

Which means **those names are part of your published API**: a generated client will have an `OrderLine` type. If
you care what the generated types are called, name your definitions accordingly, or promote them to top-level
registered schemas so they keep the name you gave them.

## Read and write contexts

A schema often describes both what a client may send and what the server returns, and those differ. JSON Schema
has `readOnly` and `writeOnly` for exactly this, and arrest honours them: body validation runs with
`context: 'write'`, so a **`readOnly`** property is **stripped from a request body** and a **`writeOnly`** one is
kept.

```ts
{
  properties: {
    _id: { type: 'string', readOnly: true },
    password: { type: 'string', writeOnly: true, minLength: 12 },
    created: { type: 'string', format: 'date-time', readOnly: true },
  },
}
```

This is a single-schema solution to a problem people usually solve with two DTOs. Two details matter, and both
are easy to get wrong:

**`readOnly` strips, it does not reject.** `POST` a body containing `created` and the response is `201`, not
`400` — the property is silently dropped before the handler sees it, so the client is never told its value was
ignored. If a client sending a server-assigned field should be an error, say so explicitly with
`additionalProperties: false` and no such property, or check for it in the operation.

**`writeOnly` is documentation, not enforcement.** Responses are not validated against the schema, so nothing
removes a `writeOnly` property on the way out: return the raw document and the password goes with it. Keeping it
in is your job — a projection in `prepareOpts`, a `redactResult` override, or a CASL field list. See
[redaction](06-security-model.md#field-level-redaction). The same holds for `readOnly`: it constrains input, and
says nothing about what your handler returns.

## Coercion, and why it differs by content type

Query, path, header and cookie parameters are always coerced: `?limit=20` arrives as the string `'20'` and a
schema saying `type: 'integer'` gets an integer. So does a `application/x-www-form-urlencoded` body, where
everything is a string by construction.

An `application/json` body is **not** coerced. `{"limit": "20"}` against `type: 'integer'` is a `400`. JSON has
types; if the client sent a string it meant a string, and quietly accepting it hides a bug in the client. This
asymmetry is deliberate and it is the one thing to remember about validation behaviour.

Defaults are applied in both cases: a parameter or property with a `default` is present in `req.query`/`req.body`
even when the caller omitted it.

## What 2020-12 actually buys you

The document declares the 2020-12 dialect, which is wider than OpenAPI 3.0's subset — but the validator,
[openapi-police](https://github.com/vivocha/openapi-police), implements part of it. A keyword it doesn't
implement is **accepted in silence and never enforced**, which is the worst failure mode there is: the schema
looks stricter than it is and nothing tells you. So the distinction matters more than the list.

Enforced — measured against openapi-police 5.1:

| Keyword | Use |
|---|---|
| `if` / `then` / `else` | conditional validation on a value |
| `const` | a fixed value, cleaner than a one-element `enum` |
| `contains` | "the array holds at least one of these" |
| `patternProperties` | constrain properties by name pattern |
| `propertyNames` | constrain the property names themselves |
| `exclusiveMinimum` / `exclusiveMaximum` as **numbers** | 2020-12 spelling; the 3.0 boolean form is what the TypeScript types describe |

**Not enforced.** Accepted, ignored, no warning: `dependentRequired`, `dependentSchemas`, `prefixItems`,
`unevaluatedProperties`. Don't rely on them — express the constraint with `if`/`then` instead:

```ts
{
  type: 'object',
  properties: {
    payment_type: { enum: ['credit_card', 'invoice'] },
    card_number: { type: 'string' },
  },
  allOf: [
    {
      // "if payment_type is credit_card, card_number is required" — enforced
      if: { properties: { payment_type: { const: 'credit_card' } }, required: ['payment_type'] },
      then: { required: ['card_number'] },
    },
  ],
}
```

`dependentRequired` would be the natural way to write "if `payment_type` is present then `billing_address` is
required", and it is the form you'll find in JSON Schema documentation — it just doesn't fire here. If you do use
it, note the key is a **property name**, not one of its values; keyed on `credit_card` it would never match
anything even in a validator that implements it.

**Use `definitions`, not `$defs`.** They are the old and new spellings of the same thing, but arrest only knows
the old one: `rebaseOASDefinitions` hoists `definitions` into `components.schemas` and rewrites the refs into it,
while `$defs` is left in place — and a surviving `#/$defs/tag` pointer then resolves against the whole OpenAPI
document, where there is no `$defs`. The result is a schema that rejects *every* body, valid ones included. See
[the rebasing section](#the-ref-you-write-depends-on-where-you-write-it).

## Dynamic schemas

When a schema isn't known until startup — read from a collection, assembled from a config file, fetched from a
registry — [`registerDynamicSchema`](../reference/api.md#registerdynamicschema) defers it:

```ts
api.registerDynamicSchema('tenant-config', new TenantConfigSchema());
```

`router()` awaits its `spec()` and registers the result. From then on it is an ordinary schema.

It resolves **once**. This is not a way to vary a schema per request — nothing about the document varies per
request, since it is built at startup. For per-request variation you want a
[`DynamicToolProvider`](../reference/mcp.md#dynamictoolprovider) on the MCP side, or validation in the handler.

## Schemas are served

If any schema is registered, `router()` adds a
[`SchemaResource`](../reference/schemas.md#schemaresource) serving `GET /schemas/{id}`. It returns the schema
**as you registered it** — `$schema` intact, own `definitions` intact — not the hoisted form in the document, so
a client can fetch it and validate against it locally with any JSON Schema library.

That endpoint is **public**: its `swaggerScopes` is empty, so no scope is required and
`?filter=authorized` never removes it. Schemas describe shapes, not data. If a schema of yours is itself
sensitive — because its property names reveal something — don't register it; inline it in the operation's `info`,
where the document filter can hide it along with the operation.

## Unused schemas cost nothing

[`removeUnusedSchemas`](../reference/schemas.md#removeunusedschemas) deletes from the served document every
schema and parameter no `$ref` points at. So a shared library of schemas registered by a base class ships only
the parts actually used.

The same pass **throws** on a `$ref` to something absent. That is the safety net: a mistyped schema name fails at
`router()`, at startup, rather than producing a document with a dangling pointer. It also means a test that never
builds the router never catches it — call `await api.router()` somewhere in your test suite.

---

[← The OpenAPI document](04-openapi-document.md) · [Manual index](../README.md) · [The security model →](06-security-model.md)
