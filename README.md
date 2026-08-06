# arrest

[![npm version](https://img.shields.io/npm/v/arrest.svg)](https://www.npmjs.com/package/arrest)
[![CI](https://github.com/vivocha/arrest/actions/workflows/ci.yml/badge.svg)](https://github.com/vivocha/arrest/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/vivocha/arrest/badge.svg?branch=master)](https://coveralls.io/github/vivocha/arrest?branch=master)

An OpenAPI 3.1 REST framework for Node.js. You describe resources and operations; arrest serves them,
validates them against JSON Schema, authorizes them, documents them as an OpenAPI document — and, if you want,
exposes them to AI agents as [MCP](https://modelcontextprotocol.io) tools, with the same validation and the same
authorization as the REST endpoints.

## Features

- **OpenAPI 3.1 first** — the document is generated from your definitions, not maintained beside them, with
  JSON Schema 2020-12 validation of every request
- **MongoDB CRUD out of the box** — six operations per collection, plus RQL querying, projections, sorting and
  pagination headers
- **One authorization decision** — OAuth2 scopes or [CASL](https://casl.js.org) abilities, enforced on requests,
  reflected in `openapi.json?filter=authorized` and in the MCP tool list, from a single method
- **Record- and field-level rules** — CASL conditions become part of the MongoDB query; CASL fields redact
  responses and reject write bodies
- **MCP server** — expose chosen operations as tools, grouped in independently scoped bundles
- **JSON-RPC** — for the calls that don't fit REST
- **Extensible by design** — a seven-stage operation pipeline, and `Resource`/`Operation` subclassing as a
  first-class path
- **Express-native** — mount it in an app you own, or let it own the server
- **TypeScript, ESM** — full type definitions, native ES modules

## Requirements

- **Node.js** >= 20.0.0
- **MongoDB** 7.x or later, if you use `MongoResource`

## Installation

```bash
npm install arrest      # or: pnpm add arrest / yarn add arrest
```

TypeScript projects need `"module": "NodeNext"` and, for the `@rpc` decorator,
`"experimentalDecorators": true`. See
[Installation and setup](https://github.com/vivocha/arrest/blob/master/docs/guide/02-installation.md).

## Quick start

```ts
import { API, MongoResource } from 'arrest';

const api = new API({ title: 'My API', version: '1.0.0' });

api.addResource(new MongoResource('mongodb://localhost:27017/mydb', { name: 'Person', namePlural: 'People' }));

await api.listen(3000);
```

That serves a full CRUD API and its own documentation:

| | |
|---|---|
| `GET /people` | list, with RQL filtering (`q`), `limit`, `skip`, `fields`, `sort`, and JSON/JSONL/CSV output |
| `POST /people` | create |
| `GET /people/{id}` | read one |
| `PUT /people/{id}` | update |
| `PATCH /people/{id}` | [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) JSON Patch |
| `DELETE /people/{id}` | delete |
| `GET /openapi.json` | the OpenAPI 3.1 document describing all of it |

```bash
$ curl -s localhost:3000/people -H 'content-type: application/json' \
    -d '{"name":"Ada Lovelace","email":"ada@example.com","country":"GB"}'
{"name":"Ada Lovelace","email":"ada@example.com","country":"GB","_id":"6a7448e1ba3533ca10cf6b9f"}

$ curl -s 'localhost:3000/people?q=eq(country,GB)&fields=name,country&limit=10'
[{"name":"Ada Lovelace","country":"GB"}]
```

Add a schema and every request is validated against it, in both the document and the code path:

```ts
api.registerSchema('person', {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0 },
  },
  additionalProperties: false,
});

api.addResource(
  new MongoResource(db, { name: 'Person', namePlural: 'People', requestSchema: { $ref: 'person' }, responseSchema: { $ref: 'person' } })
);
```

## Documentation

The manual lives in [docs/](https://github.com/vivocha/arrest/blob/master/docs/README.md) and is in three parts:

- **[Guide](https://github.com/vivocha/arrest/tree/master/docs/guide/)** — how arrest works. Architecture, the
  OpenAPI document, schemas, the security model, Express integration, errors.
- **[Tutorial](https://github.com/vivocha/arrest/tree/master/docs/tutorial/)** — a fifteen-chapter course
  building one application, from `new API()` to an MCP server and a production shape. The code is in
  [examples/tutorial/](https://github.com/vivocha/arrest/tree/master/examples/tutorial/) and type-checked in CI.
- **[Reference](https://github.com/vivocha/arrest/tree/master/docs/reference/)** — the complete surface, one
  page per module.

Start with the [introduction](https://github.com/vivocha/arrest/blob/master/docs/guide/01-introduction.md) if
arrest is new to you, or with
[chapter 00](https://github.com/vivocha/arrest/blob/master/docs/tutorial/00-setting-up.md) to build something
immediately.

### What else it does

- **[RQL querying](https://github.com/vivocha/arrest/blob/master/docs/reference/rql.md)** — `q=and(eq(country,IT),gt(age,40))` translated to MongoDB, with an aggregation pipeline when needed
- **[Authorization](https://github.com/vivocha/arrest/blob/master/docs/guide/06-security-model.md)** — scopes or CASL abilities, one decision reused by request enforcement, document filtering and MCP tool listing
- **[Field and record redaction](https://github.com/vivocha/arrest/blob/master/docs/reference/authorization.md#field-level-redaction)** — declare fields and conditions once; responses are filtered and forbidden writes refused
- **[MCP server](https://github.com/vivocha/arrest/blob/master/docs/tutorial/13-mcp.md)** — opt-in per resource, named bundles, per-tool descriptions and schemas
- **[Output formats](https://github.com/vivocha/arrest/blob/master/docs/tutorial/07-output-formats.md)** — JSON, JSONL and CSV from the same operation
- **[JSON Patch](https://github.com/vivocha/arrest/blob/master/docs/reference/utilities.md#patchtomongo)** — RFC 6902 translated to atomic MongoDB updates
- **[The pipeline](https://github.com/vivocha/arrest/blob/master/docs/tutorial/10-pipeline.md)** — seven override points between request and response
- **[Custom operations and resources](https://github.com/vivocha/arrest/blob/master/docs/tutorial/08-custom-operations.md)** — `getCustomInfo` plus a handler, and you have a documented, validated, authorized endpoint
- **[JSON-RPC](https://github.com/vivocha/arrest/blob/master/docs/reference/rpc.md)** — `@rpc`-decorated methods on a single endpoint
- **[Dynamic schemas and resources](https://github.com/vivocha/arrest/blob/master/docs/reference/schemas.md)** — schemas and MCP tools resolved per request

## Contributing

Contributions are welcome. The project uses **pnpm** and requires **100% test coverage** — statements, branches,
functions and lines — which CI enforces.

```bash
pnpm install
pnpm run build
pnpm test                 # mocha; MongoDB tests start a container via mongodoki
pnpm run check-coverage   # must report 100%
pnpm run check:examples   # type-checks the tutorial application
```

Tests are written in TypeScript under [test/ts/](test/ts/) and compiled before running. Commit with
[conventional commits](https://www.conventionalcommits.org/), branch from `master`, and open a pull request.

## License

MIT — see [LICENSE](LICENSE).

## Related projects

- [jsonref](https://github.com/vivocha/jsonref) — JSON Reference resolution
- [openapi-police](https://github.com/vivocha/openapi-police) — OpenAPI and JSON Schema validation
- [@vivocha/scopes](https://github.com/vivocha/scopes) — the scope grammar arrest authorizes with
