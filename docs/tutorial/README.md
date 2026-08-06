# The arrest tutorial

Fifteen chapters, one application. Each chapter adds one capability to the same project and ends with
something you can run and poke at with `curl`.

The code is real and lives in the repository at [examples/tutorial/](../../examples/tutorial/). It is
type-checked in CI, so it cannot drift from what these pages describe. Every chapter has an entry point under
[examples/tutorial/src/steps/](../../examples/tutorial/src/steps/) and you run it by number:

```bash
cd examples/tutorial
node dist/main.js 05        # run chapter 05 on port 3000
```

| | Chapter | You'll learn |
|---|---|---|
| 00 | [Setting up](00-setting-up.md) | the project, MongoDB, how to run a chapter |
| 01 | [Your first API](01-first-api.md) | `API`, a handler as an operation, `listen`, `openapi.json` |
| 02 | [Resources and operations](02-resources-and-operations.md) | `Resource`, `Operation`, paths, tags, parameters, 405s |
| 03 | [Persistence with MongoDB](03-mongodb.md) | `MongoResource`, the CRUD set, ids, collections |
| 04 | [Schemas and validation](04-schemas-and-validation.md) | `registerSchema`, `$ref`s, read/write contexts, indexes |
| 05 | [Querying](05-querying.md) | RQL, `fields`, `sort`, paging, the pagination headers |
| 06 | [Updating](06-updating.md) | PUT vs PATCH, JSON Patch, `escapeProperties` |
| 07 | [Output formats](07-output-formats.md) | JSON, JSONL, CSV and its parameters |
| 08 | [Custom operations](08-custom-operations.md) | `extends MongoOperation`, `getCustomInfo`, route order |
| 09 | [Custom resources](09-custom-resources.md) | `extends Resource` with no database behind it |
| 10 | [The pipeline](10-pipeline.md) | `PipelineOperation` and its seven stages |
| 11 | [Authorization with scopes](11-scopes.md) | `initSecurity`, scopes, 401 vs 403, `?filter=authorized` |
| 12 | [Abilities and redaction](12-abilities.md) | CASL: field and record authorization |
| 13 | [Serving an MCP server](13-mcp.md) | bundles, tools, what a model actually sees |
| 14 | [Production shape](14-production.md) | `extends API`, JSON-RPC, mounting, testing |

## How to read it

Chapters 00–07 are the framework as it comes: you write definitions and arrest does the work. Chapters 08–10
are how you extend it, and they are where real projects spend their time. Chapters 11–14 are the concerns you
cannot skip in production.

If you already know what you want, the chapters stand alone reasonably well — but they share one growing
codebase, so a later chapter's code assumes the earlier chapters' files exist.

Each chapter follows the same shape: **what you're building** → **the code** → **run it** → **what just
happened** → **exercises**. The exercises have no solutions written down; they are things worth breaking to see
what the error looks like.

---

[Manual index](../README.md) · [Guide](../guide/) · [Reference](../reference/) · [Chapter 00 →](00-setting-up.md)
