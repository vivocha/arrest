# The arrest manual

arrest is an OpenAPI 3.1 REST framework for Node.js: you describe resources and operations, and arrest
serves them, validates them, authorizes them and documents them — as an OpenAPI document, and optionally
as an MCP tool server.

This manual is in three parts. They are meant to be read in different situations, not in sequence.

## [Guide](guide/) — how arrest works

Conceptual, no exercises. Read it once to build a mental model, come back to it when something surprises
you.

1. [Introduction](guide/01-introduction.md) — what arrest is and what it assumes
2. [Installation and setup](guide/02-installation.md) — ESM, TypeScript config, what is and isn't exported
3. [Architecture](guide/03-architecture.md) — API → Resource → Operation, and a request's path through them
4. [The OpenAPI document](guide/04-openapi-document.md) — how it is assembled, served and filtered
5. [Schemas](guide/05-schemas.md) — registration, `$ref` rebasing, dynamic schemas
6. [The security model](guide/06-security-model.md) — one authorization decision, three places it surfaces
7. [Express integration](guide/07-express-integration.md) — routers, mounting, versioning, route order
8. [Errors](guide/08-errors.md) — `RESTError`, validation errors, and who reports what

## [Tutorial](tutorial/) — the course

Fifteen chapters, each building on the previous one, all against a single example app that lives in
[examples/tutorial/](../examples/tutorial/). Start at chapter 00 and work forward; every chapter ends with
something you can run.

| | Chapter | You'll learn |
|---|---|---|
| 00 | [Setting up](tutorial/00-setting-up.md) | the example project, how to run each chapter |
| 01 | [Your first API](tutorial/01-first-api.md) | `API`, `SimpleOperation`, `listen`, `openapi.json` |
| 02 | [Resources and operations](tutorial/02-resources-and-operations.md) | `Resource`, paths, routes, tags, 405s |
| 03 | [Persistence with MongoDB](tutorial/03-mongodb.md) | `MongoResource`, CRUD, ids, indexes |
| 04 | [Schemas and validation](tutorial/04-schemas-and-validation.md) | `registerSchema`, `$ref`s, read/write contexts |
| 05 | [Querying](tutorial/05-querying.md) | RQL, projections, sorting, pagination headers |
| 06 | [Updating](tutorial/06-updating.md) | PUT vs PATCH, JSON Patch, `patchToMongo` |
| 07 | [Output formats](tutorial/07-output-formats.md) | JSON, JSONL, CSV |
| 08 | [Custom operations](tutorial/08-custom-operations.md) | `extends Operation`, `getCustomInfo` |
| 09 | [Custom resources](tutorial/09-custom-resources.md) | mixing generated and hand-written routes, route order |
| 10 | [The pipeline](tutorial/10-pipeline.md) | `PipelineOperation`, `Job`, the seven hooks |
| 11 | [Authorization with scopes](tutorial/11-scopes.md) | `initSecurity`, scopes, 401 vs 403 |
| 12 | [Abilities and redaction](tutorial/12-abilities.md) | CASL, record and field filtering |
| 13 | [Serving an MCP server](tutorial/13-mcp.md) | bundles, tools, what a model sees |
| 14 | [Production shape](tutorial/14-production.md) | subclassing `API`, JSON-RPC, dynamic providers, testing |

## [Reference](reference/) — the complete surface

Every exported class, method and option, organized by module. Look things up here.

- [API](reference/api.md) · [Resource](reference/resource.md) · [Operation](reference/operation.md) · [PipelineOperation](reference/pipeline.md)
- [MongoResource](reference/mongo-resource.md) · [Mongo operations](reference/mongo-operations.md) · [RQL](reference/rql.md)
- [Schemas](reference/schemas.md) · [Authorization](reference/authorization.md)
- [MCP](reference/mcp.md) · [JSON-RPC](reference/rpc.md)
- [Errors](reference/errors.md) · [Defaults](reference/defaults.md) · [Utilities](reference/utilities.md) · [Types](reference/types.md)

## Where to start

- **Never used arrest**: [Introduction](guide/01-introduction.md), then the tutorial from
  [chapter 00](tutorial/00-setting-up.md).
- **Have an API to build now**: the [quick start](../README.md#quick-start), then tutorial chapters
  [03](tutorial/03-mongodb.md), [04](tutorial/04-schemas-and-validation.md) and
  [05](tutorial/05-querying.md).
- **Extending arrest**: [Architecture](guide/03-architecture.md), then tutorial chapters
  [08](tutorial/08-custom-operations.md)–[10](tutorial/10-pipeline.md).
- **Adding auth**: [The security model](guide/06-security-model.md), then chapters
  [11](tutorial/11-scopes.md) and [12](tutorial/12-abilities.md).
- **Exposing tools to an LLM**: [chapter 13](tutorial/13-mcp.md) and the [MCP reference](reference/mcp.md).

---

Something wrong or missing? [Open an issue](https://github.com/vivocha/arrest/issues) — the docs live in
the repository, so a pull request works too.
