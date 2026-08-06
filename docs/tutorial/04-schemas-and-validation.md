# 04 — Schemas and validation

**Goal:** one schema declaration that validates every write, documents every read, and drives the MCP tools in
chapter 13.

From this chapter on, the tutorial stops writing everything in the step file. The schema lives in
[schemas/person.ts](../../examples/tutorial/src/schemas/person.ts) and the resource in
[resources/person.ts](../../examples/tutorial/src/resources/person.ts), because every later chapter uses them.

## The code

### The schema

[examples/tutorial/src/schemas/person.ts](../../examples/tutorial/src/schemas/person.ts):

```ts
export const PERSON_SCHEMA = {
  type: 'object',
  definitions: {
    tag: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
        colour: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
      additionalProperties: false,
    },
  },
  required: ['name', 'email'],
  properties: {
    _id: { $ref: 'objectId', readOnly: true },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    country: { type: 'string', minLength: 2, maxLength: 2, description: 'ISO 3166-1 alpha-2 country code' },
    notes: { type: 'string', writeOnly: true },
    tags: { type: 'array', items: { $ref: '#/definitions/tag' }, maxItems: 10 },
    created: { type: 'string', format: 'date-time', readOnly: true },
  },
  additionalProperties: false,
} as OpenAPIV3.SchemaObject;

export function registerPersonSchema(api: API): void {
  api.registerSchema('person', PERSON_SCHEMA);
}
```

### The resource

[examples/tutorial/src/resources/person.ts](../../examples/tutorial/src/resources/person.ts):

```ts
export class PersonResource extends MongoResource {
  constructor(db: Db, routes?: MongoRoutes) {
    super(db, {
      name: 'Person',
      namePlural: 'People',
      description: 'The people known to this API',
      collection: 'people',
      createIndexes: true,
      queryLimit: 50,
    }, routes);
  }

  get schema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
    return { $ref: '#/components/schemas/person' };
  }

  protected getIndexes(): any[] | undefined {
    return [
      ...(super.getIndexes() || []),
      { key: { email: 1 }, unique: true },
      { key: { country: 1, name: 1 } },
    ];
  }
}
```

### Wiring them together

```ts
registerPersonSchema(api);
api.addResource(new PersonResource(db));
```

Order matters: register before you add. `registerSchema` writes into `components.schemas`, and the resource's
operations resolve `#/components/schemas/person` while attaching.

## Run it

```bash
node dist/main.js 04
```

```bash
$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' \
    -d '{"name":"Ada","email":"ada@example.com","age":36,"country":"GB","tags":[{"name":"maths","colour":"#ff0000"}]}'
{"name":"Ada","email":"ada@example.com","age":36,"country":"GB","tags":[…],"_id":"6a7438b05d180d37cacccd7d"}
```

And the failures, which are the point of the chapter:

```bash
$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' -d '{"name":"NoEmail"}'
{"error":400,"message":"ValidationError","info":{"type":"required","path":"body/email",
 "scope":"http://vivocha.com/api/v3#/components/schemas/person"}}

$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' -d '{"name":"X","email":"x@y.com","extra":1}'
{"error":400,"message":"ValidationError","info":{"type":"additionalProperties","path":"body",
 "errors":[{"type":"false","path":"body/extra", …}]}}

$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' \
    -d '{"name":"X","email":"t@y.com","tags":[{"name":"a","colour":"red"}]}'
{"error":400,"message":"ValidationError","info":{"type":"properties","path":"body","errors":[
  {"type":"items","path":"body/tags","errors":[
    {"type":"properties","path":"body/tags/0","scope":"…#/components/schemas/person_tag","errors":[
      {"type":"pattern","path":"body/tags/0/colour","scope":"…#/components/schemas/person_tag/properties/colour"}]}]}]}}
```

## What just happened

### The error body is machine-readable

`info` is a tree, not a sentence. Each node has a `type` — the JSON Schema keyword that failed — a `path` into
the request body, and a `scope`, which is a JSON pointer into your schema. Nested failures nest.

That is worth designing a client around: a form can highlight `body/tags/0/colour` and say *this* is the field
and *pattern* is the reason, without parsing prose. There is no human-readable message because arrest doesn't
know your users' language.

Note the `scope` on the innermost error says `person_tag`, not `person`. The `definitions.tag` subschema became
a top-level component, which is the next thing.

### `definitions` got hoisted

Nothing referred to `person_tag` in your source. When the router is built,
[`rebaseOASDefinitions`](../reference/schemas.md#rebaseoasdefinitions) walks every schema, moves nested
`definitions` up into `components.schemas` under `<parent>_<name>`, and rewrites the `$ref`s that pointed at
them. So:

- `person.definitions.tag` becomes `components.schemas.person_tag`;
- `{ $ref: '#/definitions/tag' }` inside `person` becomes `{ $ref: '#/components/schemas/person/definitions/tag' }`
  when the schema is registered, and then points at the hoisted copy.

Why care? Because a generated client will have a `PersonTag` type. Naming your subschemas is naming your
client's types.

**Use `definitions`, not `$defs`.** JSON Schema 2020-12 renamed the keyword, and arrest's rebasing knows only the
old name. A `$defs` subschema is not hoisted and its `$ref` is not rewritten, so `#/$defs/tag` resolves against
the whole document — where there is no `$defs` — and the reference silently matches nothing. Concretely: with
`$defs`, `{"tags":[{"name":""}]}` is accepted; with `definitions` it is the 400 it should be. This is the single
most expensive difference between what the JSON Schema spec says and what arrest does.

### `$ref` inside a registered schema is rebased; elsewhere it is not

Inside a schema passed to `registerSchema`, short references work:

| You write | It becomes |
|---|---|
| `{ $ref: 'objectId' }` | `#/components/schemas/objectId` |
| `{ $ref: '#/definitions/tag' }` | `#/components/schemas/person/definitions/tag` |
| `{ $ref: 'address#/definitions/city' }` | `#/components/schemas/address/definitions/city` |

Outside one, they don't — which is why `PersonResource.schema` writes the pointer in full:

```ts
get schema() {
  return { $ref: '#/components/schemas/person' };   // not { $ref: 'person' }
}
```

A short `{ $ref: 'person' }` in a getter, or in an operation's `getCustomInfo`, is treated as a URL and fails
when the document is parsed. The rule is simple once you know it: **rebasing is a feature of `registerSchema`,
not of arrest.**

`objectId` above is one of the schemas in the [default document](../reference/defaults.md#schemas) — a plain
`{ type: 'string' }` — so referring to it is a way of saying "a resource id" and having the document say so too.

### `readOnly` strips, it does not reject

This one surprises everybody, so measure it rather than assume:

```bash
$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' \
    -d '{"_id":"aaaaaaaaaaaaaaaaaaaaaaaa","name":"RO","email":"ro@y.com"}'
{"name":"RO","email":"ro@y.com","_id":"6a7438b05d180d37cacccd7e"}
```

That is a **201**, and the `_id` in the response is not the one sent. Request bodies are validated with
`context: 'write'`, and in that context a `readOnly` property is **removed from the data** before the rest of the
validation runs. It is not an error to send one; it just doesn't survive.

That is the right behaviour for the common case — a client that `GET`s a record, edits one field and `PUT`s the
whole thing back doesn't have to strip `_id` and `created` itself — but it means `readOnly` is not a guard. If
sending `_id` must be an error in your API, say so with `additionalProperties: false` and no `_id` property at
all.

`writeOnly` is weaker still: it is **documentation only**.

```bash
$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' \
    -d '{"name":"WO","email":"wo@y.com","notes":"secret"}'
{"name":"WO","email":"wo@y.com","notes":"secret", …}          # and a GET returns it too
```

arrest never validates responses, so nothing applies `context: 'read'` on the way out and nothing strips
`notes`. If a field must not leave the server, remove it — chapter 10 does that in `redactResult`, and chapter 12
gets it done declaratively with an ability.

### The schema is served

```bash
$ curl -s localhost:3000/schemas/person
{"type":"object","definitions":{"tag":{…}},"required":["name","email"],"properties":{…}}
```

`GET /schemas/:id` returns the schema **as you registered it** — short `$ref`s, nested `definitions` and all.
That is `api.originalSchemas`, kept aside before rebasing, so it is a schema a JSON Schema validator can use
after resolving `objectId`, not a fragment of the OpenAPI document. Only registered names are served, so
`/schemas/person_tag` (which exists only after hoisting) is a 404.

### Indexes

`createIndexes: true` plus a `getIndexes()` override, and the collection gets its indexes on first use:

```ts
protected getIndexes(): any[] | undefined {
  return [
    ...(super.getIndexes() || []),
    { key: { email: 1 }, unique: true },
    { key: { country: 1, name: 1 } },
  ];
}
```

Two details. `super.getIndexes()` returns a unique index on a custom `id` property — or **`undefined`** when the
id is `_id`, which MongoDB indexes anyway. So `...super.getIndexes()` throws and `...(super.getIndexes() || [])`
is the idiom. And without `createIndexes: true` arrest only *warns* about missing indexes rather than creating
them, which is what you want in an environment where the application user has no DDL rights.

The unique index also gives you this:

```bash
$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' \
    -d '{"name":"Dup","email":"ada@example.com"}'
{"error":400,"message":"duplicate key"}
```

A MongoDB duplicate-key error is translated to a `400`, not a 500. Which is another argument for the unique
index: without it, "this email is taken" is a race condition you have to check for by hand.

### One wart, and why the code has an `as`

```ts
} as OpenAPIV3.SchemaObject;
```

Not an annotation — an assertion. `OpenAPIV3.SchemaObject` is OpenAPI 3.0-shaped and has no `definitions`, so
annotating the object is a compile error (`TS2353`) on a schema arrest itself understands perfectly. The same
applies to `$defs`, `const` and `if`/`then`. The assertion keeps completions for the keywords the type does know
and gets out of the way for the ones it doesn't.

### What 2020-12 actually validates

The document declares `jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema`, and the validator does
implement much of it — `if`/`then`/`else`, `const`, `contains`, `patternProperties`, `propertyNames` and numeric
`exclusiveMinimum`/`exclusiveMaximum` all work. But not all of it: `dependentRequired`, `dependentSchemas`,
`prefixItems` and `unevaluatedProperties` are accepted and **not enforced**. See
[the guide](../guide/05-schemas.md#what-2020-12-actually-buys-you) for the full split. Test any keyword beyond
the basics against a request that should fail.

## Exercises

1. Change `definitions` to `$defs` and re-run the bad-tag request from above. It passes. Change it back.
2. `PUT` a person without `email`. Which validator caught it, and is the error shape the same as `POST`'s?
3. Add `{ minAge: … }`-style cross-field validation with `dependentRequired` and confirm it is ignored.
4. Remove `createIndexes: true`, drop the collection, restart with `DEBUG=arrest*` and find the warning.
5. `GET /schemas/person` and `GET /openapi.json | jq '.components.schemas.person'` — describe the difference in
   one sentence.

---

[← Chapter 03](03-mongodb.md) · [Tutorial index](README.md) · [Chapter 05 →](05-querying.md)
