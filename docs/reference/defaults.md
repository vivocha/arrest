# Defaults

Source: [src/defaults.ts](../../src/defaults.ts)

Every [`API`](api.md) starts from `DEFAULT_DOCUMENT`, deep-cloned and deep-extended with whatever you pass to
the constructor. It declares the OpenAPI version, the JSON Schema dialect, and a set of reusable components the
generated operations `$ref` into.

This module is **not re-exported** from the package root:

```ts
import { DEFAULT_DOCUMENT, JSON_SCHEMA_DRAFT_2020_12 } from 'arrest/dist/defaults.js';
```

See [utilities.md](utilities.md#importing-the-non-exported-modules). You rarely need it: reading it is more
useful than importing it, since the components it declares are already in your document.

## `DEFAULT_DOCUMENT`

```ts
{
  openapi: '3.1.0',
  info: { title: 'REST API', version: '1.0.0' },
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  components: { schemas: {…}, responses: {…}, parameters: {…} },
  paths: {},
}
```

`info.title` and `info.version` are the two you always override — `version` in particular, since
[`attach`](api.md#attach) mounts the API at `/v<major>` and `listen` doesn't:

```ts
const api = new API({ title: 'Acme API', version: '2.1.0' });
```

`jsonSchemaDialect` declares **draft 2020-12** for every schema in the document. OpenAPI 3.1 aligned with JSON
Schema, so there is no "OpenAPI flavour" of these keywords to learn — but declaring the dialect is not the same
as implementing it: the validator enforces `if`/`then`/`else`, `const`, `contains`, `patternProperties`,
`propertyNames` and numeric `exclusiveMinimum`/`exclusiveMaximum`, and silently ignores `dependentRequired`,
`dependentSchemas`, `prefixItems` and `unevaluatedProperties`. `$defs` is worse than ignored — it breaks
validation outright. See
[guide/05-schemas.md](../guide/05-schemas.md#what-2020-12-actually-buys-you).

The constructor argument is merged **under `info`**, not over the whole document — `deepExtend(clone(DEFAULT_DOCUMENT), { info })`
— so a `components` key passed to the constructor ends up as `document.info.components` and does nothing. To add
to `components`, assign on the document, which the defaults guarantee exists:

```ts
const api = new API({ title: 'Acme API', version: '2.1.0' });

api.document.components!.securitySchemes = {
  oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: '/token', scopes: {} } } },
};
```

Assigning one key of `components` leaves the others — the default schemas, responses and parameters — in place.
Replacing `document.components` wholesale removes them, and `#/components/responses/defaultError` is referenced
by every operation, so that fails at `router()`.

The `info` merge itself is [eredita](https://github.com/vivocha/eredita)'s `deepExtend`, where **arrays merge by
index** — the same rule that governs [`getInfo`](operation.md#building-the-openapi-definition).

## Schemas

| Name | Description |
|---|---|
| `metadata` | `{ type: 'object' }` — the shape of the `_metadata` subdocument. Declared for the benefit of resource schemas that reference it; arrest itself always projects `_metadata` out |
| `objectId` | `{ type: 'string' }` — the identifier of a resource. Reference it from a schema's id field so the document says "an id here", not "any string" |
| `errorResponse` | `{ error: integer ≥ 100, message: string, info?: string }`, requiring `error` and `message` — the [error body](errors.md#the-response-shape) |

Reference them the OpenAPI way, in full, since they are already in the document and not registered through
[`registerSchema`](api.md#registerschema):

```ts
{ $ref: '#/components/schemas/objectId' }
```

## Responses

| Name | Meaning |
|---|---|
| `defaultError` | The generic error response, `errorResponse` as `application/json`. [`getDefaultInfo`](operation.md#building-the-openapi-definition) attaches it as the `default` response of **every** operation |
| `notFound` | Same body, for a `404`. The Mongo operations on `/:id` declare it |

```ts
protected getCustomInfo(): OpenAPIV3.OperationObject {
  return {
    responses: {
      '200': { description: 'ok', content: { 'application/json': { schema: this.responseSchema } } },
      '404': { $ref: '#/components/responses/notFound' },
    },
  };
}
```

Both survive [`removeUnusedSchemas`](schemas.md#removeunusedschemas) even when nothing references them —
responses are counted but never deleted — so they are always available to a client generator.

## Parameters

The nine reusable parameters. [`QueryMongoOperation`](mongo-operations.md#querymongooperation) references all
but `id`; `id` is referenced by every operation on `/:id`.

| Name | In | Query name | Schema |
|---|---|---|---|
| `id` | path | `id` | `string`, **required** |
| `limit` | query | `limit` | `integer`, 1–100 |
| `skip` | query | `skip` | `integer` ≥ 0 |
| `fields` | query | `fields` | `string[]`, unique |
| `sort` | query | `sort` | `string[]`, unique — RQL syntax (`a,-b,+c`) |
| `query` | query | **`q`** | `string` — an [RQL](rql.md) expression |
| `format` | query | `format` | `enum ['json', 'jsonl', 'csv']` |
| `csvFields` | query | **`csv_fields`** | `string[]`, ≥ 1 item, unique |
| `csvNames` | query | **`csv_names`** | `string[]`, ≥ 1 item, unique |
| `csvOptions` | query | **`csv_options`** | `object`, `style: 'simple'`, `explode: true` |

Note the component name and the parameter name differ for four of them: `query` is sent as `q`, and the CSV
family is snake_cased. Reference them by **component** name, and callers use the **query** name.

`limit`'s maximum of 100 is a document-level cap enforced by the validator, and it is the only cap unless the
resource sets [`queryLimit`](mongo-resource.md#mongoresourcedefinition) — which is applied afterwards, and also
becomes the default page size. RQL's own `limit()` modifier bypasses both validation and the maximum; see
[rql.md](rql.md#modifiers).

Raise the cap by editing the parameter before adding resources:

```ts
(api.document.components!.parameters!.limit as OpenAPIV3.ParameterObject).schema = {
  type: 'integer',
  minimum: 1,
  maximum: 1000,
};
```

Since operations `$ref` the component rather than copying it, this changes every query operation at once.

### `csv_options`

An object parameter declared `style: 'simple', explode: true`. Two wire forms reach it, and both work:

```
?csv_options=header=false,separator=;              # one value, comma-separated key=value pairs
?csv_options[header]=false&csv_options[separator]=;  # bracket form, parsed by Express's qs
```

The first is what `style: 'simple'` + `explode: true` specifies: the validator splits the single value on `,` and
each piece on `=`. The second works for a different reason — Express's query parser has already built an object,
so the style parsing is skipped and the object is validated as it stands. Either way the values are coerced
(`"false"` → `false`) and validated, so `csv_options[separator]=abc` is a 400 on `maxLength`.

| Property | Type | Effect |
|---|---|---|
| `unwind` | `string` | Emit one row per element of the named array field |
| `separator` | 1 char | Field separator. Default `,` |
| `decimal` | 1 char | Decimal separator. Default `.` |
| `eol` | `string` | End-of-line sequence |
| `dateFormat` | `string` | [luxon](https://moment.github.io/luxon/#/formatting?id=table-of-tokens) format for dates |
| `timezone` | `string` | Timezone for dates, e.g. `Europe/Rome` |
| `header` | `boolean` | Include the header row. **Default `true`** |
| `quotes` | `boolean` | Quote every value |
| `filename` | `string` | Sets `Content-Disposition`, so a browser downloads under this name |

`header`'s `default: true` applies only **when `csv_options` is present**: a default fills in a missing property
of an object that exists, and with no `csv_options` at all there is no object to fill in. So `?format=csv&
csv_fields=name,age` emits no header row, while `?…&csv_options=quotes=true` — or any other option — emits one.
See [`toCSV`](utilities.md#tocsv) for what each option does to the output, and
[`createJob`](pipeline.md#createjob) for how they reach it.

`format=csv` **also requires a non-empty `csv_fields`** — without it the response silently falls back to JSON.
CSV has no way to represent a document whose fields aren't known in advance, so there is nothing to guess.

`eol` can only be set through the bracket form. In the comma-separated form the value is split with a regexp
whose `.` matches neither `\r` nor `\n`, so `csv_options=eol=%0D%0A` — already decoded to a literal CRLF by
Express — fails to match and is dropped silently. `csv_options[eol]=%0D%0A` works.

Unknown keys are accepted: the schema declares no `additionalProperties`, so a misspelt option validates and
does nothing.

## Response headers arrest sets

Not in `defaults.ts` — they are declared by the operations that set them — but this is the place to look them
up.

| Header | Set by | Meaning |
|---|---|---|
| `Results-Matching` | [`QueryMongoOperation.runOperation`](mongo-operations.md#runoperation) | Documents matching the query, before paging. Can exceed the number of items returned when field redaction empties records |
| `Results-Skipped` | same | The effective `skip`, when non-zero |
| `Link` | same | RFC 5988, `rel="next"` only, and **only when `limit` is set** |
| `Location` | [`CreateMongoOperation`](mongo-operations.md#createmongooperation) | URL of the created document |
| `Content-Type` | [`processResult`](pipeline.md#processresult) | `text/csv` or `application/jsonl` for those formats; otherwise Express's JSON default |
| `Content-Disposition` | `processResult`, from `csv_options[filename]` | `inline; filename=…` |
| `Cache-Control` | [the `openapi.json` handler](api.md#router) | `no-store`, when `?filter=` made the response caller-dependent |
| `Access-Control-Allow-Origin` / `-Methods` | same | `*` and `GET` — `openapi.json` is readable cross-origin by design |

## `JSON_SCHEMA_DRAFT_2020_12`

The draft 2020-12 meta-schema, as a plain object. Exported for validating schemas *as data* — a
[dynamic schema](api.md#registerdynamicschema) assembled from a database, say, or a schema a client submits:

```ts
import { JSON_SCHEMA_DRAFT_2020_12 } from 'arrest/dist/defaults.js';

api.registerSchema('jsonSchema', JSON_SCHEMA_DRAFT_2020_12);
```

arrest does not use it internally — openapi-police carries its own validators.

`JSON_SCHEMA_DRAFT_7` is a **deprecated alias** for the same object, kept for backward compatibility. It has
not been draft-07 since the 3.1 migration; use the 2020-12 name.

---

[← Errors](errors.md) · [Reference index](README.md) · [Utilities →](utilities.md)
