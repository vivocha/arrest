# Installation and setup

## Requirements

| | |
|---|---|
| Node.js | **≥ 20.0.0** — enforced by `engines` |
| MongoDB | **7.x or later**, only if you use [`MongoResource`](../reference/mongo-resource.md) |
| TypeScript | **≥ 5.0** if you use it. Optional, but the framework is designed around it |

## Install

```bash
npm install arrest
pnpm add arrest
yarn add arrest
```

Express, MongoDB's driver, `@casl/ability`, `@vivocha/scopes` and `openapi-police` come as dependencies — you
don't install them separately, and you shouldn't add your own copy of the MongoDB driver, or you'll be passing
`Db` objects between two different builds of it.

For TypeScript you'll want Express's types, since your handler signatures mention them:

```bash
npm install --save-dev @types/express @types/node
```

## ESM only

arrest is `"type": "module"` and ships ESM only. There is no CommonJS build and no plan for one. Your package
needs:

```json
{
  "type": "module"
}
```

From CommonJS, dynamic `import()` works — `const { API } = await import('arrest')` — but it is not a pleasant
way to live in a framework you subclass. Move the project to ESM.

## TypeScript configuration

A working `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "outDir": "dist",
    "strictNullChecks": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

Three of these are not optional:

**`module`/`moduleResolution: "NodeNext"`.** arrest's own type declarations use `.js` extensions in their
imports; anything else fails to resolve them. It also means **your** relative imports need the extension:

```ts
import { PersonResource } from './resources/person.js'; // .js, even though the file is .ts
```

**`experimentalDecorators: true`.** Required for [`@rpc`](../reference/rpc.md#rpc), and therefore for
[MCP](../reference/mcp.md), which is built on it. arrest uses the legacy (TypeScript 4) decorator semantics, not
the ES2022 standard ones — do **not** also set `"useDefineForClassFields"` expecting standard decorators. If
you never write an RPC method you can omit the flag, but there is no cost to leaving it on.

**`esModuleInterop`/`allowSyntheticDefaultImports`.** Several dependencies (`lodash`, `express`, `needle`) are
CommonJS with default exports.

`strictNullChecks` is on in arrest's own build and the declarations assume it; `strict: true` works too and is
worth having.

## Running

Compile and run:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch & node --watch dist/index.js"
  }
}
```

Or skip the build in development with [tsx](https://tsx.is):

```bash
npx tsx watch src/index.ts
```

Top-level `await` works — it is ES2022 and ESM — which is what makes `await api.listen(3000)` at the end of
your entry point legitimate rather than a floating promise.

## Logging

arrest logs through [debuggo](https://github.com/vivocha/debuggo), which sits on
[debug](https://github.com/debug-js/debug). Nothing is printed until you ask:

```bash
DEBUG=arrest* node dist/index.js
```

That gets you the router being built, each parameter validated, each authorization decision, and each Mongo
query and options object. It is the first thing to turn on when a request doesn't do what you expect.

`arrest` is the default namespace; override
[`API.getDebugLabel`](../reference/api.md#logging) to use your service's name. Inside operations, log through
[`req.logger`](../reference/types.md#logger) rather than `console` so lines carry the request's context id.

## What is exported, and what isn't

Everything you normally need comes from the root:

```ts
import { API, MongoResource, Operation, PipelineOperation, Resource, RESTError } from 'arrest';
```

The root also re-exports the whole of [`@casl/ability`](https://casl.js.org),
[`@vivocha/scopes`](https://github.com/vivocha/scopes) and
[`openapi-police`](https://github.com/vivocha/openapi-police), so `Ability`, `Scopes`, `OpenAPIV3` and
`ValidationError` come from `arrest` too — one import, one version.

Four modules are **not** re-exported:

| Module | Deep import | Holds |
|---|---|---|
| [src/util.ts](../../src/util.ts) | `arrest/dist/util.js` | `toCSV`, `checkAbility`, the schema utilities |
| [src/mongo/util.ts](../../src/mongo/util.ts) | `arrest/dist/mongo/util.js` | `addConstraint`, `escapeMongoKey`, `patchToMongo`, `toMongoQuery` |
| [src/defaults.ts](../../src/defaults.ts) | `arrest/dist/defaults.js` | `DEFAULT_DOCUMENT`, `JSON_SCHEMA_DRAFT_2020_12` |
| [src/schema.ts](../../src/schema.ts) | `arrest/dist/schema.js` | `SchemaResource` |

Plus [src/mongo/rql.ts](../../src/mongo/rql.ts) — `arrest/dist/mongo/rql.js` — a default export, in no index at
all.

```ts
import { toCSV } from 'arrest/dist/util.js';
import { addConstraint } from 'arrest/dist/mongo/util.js';
```

The paths name `dist/` and end in `.js` because that is what exists at runtime; `.d.ts` files sit beside them,
so types come through. They are declared in the package's
[`exports` map](../reference/utilities.md#importing-the-non-exported-modules), so this is a supported import,
not a reach behind the package boundary. `addConstraint` in particular is needed by any real
[`prepareQuery`](../reference/pipeline.md#preparequery) override, so you will meet it.

## Verifying the setup

```ts
// src/index.ts
import { API, Resource } from 'arrest';

const api = new API({ title: 'Test', version: '1.0.0' });

api.addResource(
  new Resource({ name: 'Health' }, { '/': { get: (req, res) => res.json({ ok: true }) } })
);

await api.listen(3000);
```

```bash
curl localhost:3000/healths        # {"ok":true}
curl localhost:3000/openapi.json   # the document
```

`/healths` because the path comes from the pluralized name — see
[architecture](03-architecture.md#names-and-paths) for how to get `/health`.

If `openapi.json` returns a document, the assembly worked, and everything else in this manual is a variation on
it.

---

[← Introduction](01-introduction.md) · [Manual index](../README.md) · [Architecture →](03-architecture.md)
