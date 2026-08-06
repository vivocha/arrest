# Reference

The complete public surface of arrest, organized by module. Each page lists constructors, properties and
methods, marks the members meant to be overridden, and links to the source.

| Page | Covers |
|---|---|
| [api.md](api.md) | `API` — the document, the router, security and error entry points |
| [resource.md](resource.md) | `Resource`, `ResourceDefinition`, `Routes` |
| [operation.md](operation.md) | `Operation`, `SimpleOperation`, validators, authorization members |
| [pipeline.md](pipeline.md) | `PipelineOperation`, `Job`, `SimplePipelineOperation` |
| [mongo-resource.md](mongo-resource.md) | `MongoResource`, `MongoResourceDefinition`, indexes, collections |
| [mongo-operations.md](mongo-operations.md) | `MongoOperation` and the six CRUD operations |
| [rql.md](rql.md) | the RQL dialect arrest understands and its MongoDB translation |
| [schemas.md](schemas.md) | schema registration, `$ref` rebasing, `SchemaResource` |
| [authorization.md](authorization.md) | scopes, CASL abilities, `checkAbility`, constraints |
| [mcp.md](mcp.md) | `MCPResource`, `MCPOperation`, providers, tool schema derivation |
| [rpc.md](rpc.md) | `JSONRPC`, `@rpc`, `JSONRPCError` |
| [errors.md](errors.md) | `RESTError` and the error-handling entry points |
| [defaults.md](defaults.md) | the built-in document: parameters, responses, schemas |
| [utilities.md](utilities.md) | `src/util.ts`, `src/mongo/util.ts`, and how to import them |
| [types.md](types.md) | `APIRequest`, `APIResponse`, `Method`, `METHODS` |

## Conventions used on these pages

- **override point** marks a member designed to be replaced in a subclass. Members not so marked are
  called by arrest and can be overridden, but you're on your own about the contract.
- `protected` members are visible to subclasses only; TypeScript enforces this, JavaScript does not.
- Signatures are given as TypeScript. Optional parameters and their defaults are shown as declared.
- Source links point at files, not line numbers, so they stay valid.

## What is exported

Everything documented here is exported from the package root:

```ts
import { API, MongoResource, Operation, PipelineOperation } from 'arrest';
```

`arrest` also re-exports the whole of [`@casl/ability`](https://casl.js.org),
[`@vivocha/scopes`](https://github.com/vivocha/scopes) and
[`openapi-police`](https://github.com/vivocha/openapi-police), so `Ability`, `Scopes`, `OpenAPIV3` and
`ValidationError` come from `arrest` too — as does anything *those* re-export in turn, which is how
`jsonref`'s `isRef`/`normalizeUri` and `jsonpolice`'s `Schema`/`SchemaError` end up on the package root. So
`import * as arrest` yields far more names than this reference covers: 38 are arrest's own, and every one of
them is documented here. The rest belong to those packages and are documented by them.

Four modules are **not** re-exported and need a deep import — see
[utilities.md](utilities.md#importing-the-non-exported-modules).

---

[← Manual index](../README.md) · [Guide](../guide/) · [Tutorial](../tutorial/)
