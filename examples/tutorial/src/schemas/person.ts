import { API, OpenAPIV3 } from 'arrest';

/**
 * The schema of a person, registered once on the API and referenced by the resource.
 *
 * Registering it means one declaration drives the POST and PUT body validators, the response schema of every
 * read path, the per-path checks of PATCH, and the input schema of every MCP tool derived from the resource.
 *
 * Inside a registered schema, a `$ref` is *rebased*: short forms like `{ $ref: 'address' }` and
 * `{ $ref: '#/definitions/tag' }` work. Outside one — in an operation's getCustomInfo, say — write the full
 * pointer, `#/components/schemas/person`.
 *
 * Note the `as OpenAPIV3.SchemaObject` rather than a plain annotation. That type is OpenAPI 3.0-shaped and has
 * no `definitions` (nor `$defs`, `const`, `if`/`then`), so annotating would be an error on a schema arrest
 * itself understands. The assertion keeps completion for the keywords the type does know and gets out of the
 * way for the ones it doesn't.
 */
export const PERSON_SCHEMA = {
  type: 'object',
  definitions: {
    // hoisted into components.schemas.person_tag by router(), so a generated client calls it PersonTag
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
    // Server-assigned. `readOnly` in a request body means *stripped*, not rejected: POST a person with an
    // `_id` and you get a 201 for a person with a different, server-generated one. Measure it before you
    // rely on the other reading.
    _id: { $ref: 'objectId', readOnly: true },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    country: { type: 'string', minLength: 2, maxLength: 2, description: 'ISO 3166-1 alpha-2 country code' },
    // `writeOnly` is documentation only. arrest never validates a response, so nothing strips this on the way
    // out — GET a person and `notes` is right there. Chapter 10 removes it explicitly, which is the only way.
    notes: { type: 'string', writeOnly: true },
    tags: { type: 'array', items: { $ref: '#/definitions/tag' }, maxItems: 10 },
    created: { type: 'string', format: 'date-time', readOnly: true },
  },
  additionalProperties: false,
} as OpenAPIV3.SchemaObject;

export function registerPersonSchema(api: API): void {
  api.registerSchema('person', PERSON_SCHEMA);
}
