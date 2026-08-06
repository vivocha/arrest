# `Resource`

Source: [src/resource.ts](../../src/resource.ts)

A resource is a group of operations sharing a base path, a tag and an OAuth2 scope. `Resource` itself is
concrete and useful on its own: give it routes and it serves them.

```ts
import { Resource } from 'arrest';

const users = new Resource({ name: 'User' }, {
  '/': { get: listHandler },
  '/:id': { get: readHandler },
});
```

## Constructor

```ts
constructor(info: ResourceDefinition = {}, routes?: Routes)
```

Routes may be passed as the second argument or as `info.routes`, but **not both** — that throws
`Error('double routes specification')`. When given in `info`, they are deleted from it after being read, so
they don't end up in the document.

## `ResourceDefinition`

```ts
interface ResourceDefinition {
  name?: string;
  namePlural?: string;
  path?: string;
  description?: string;
  externalDocs?: OpenAPIV3.ExternalDocumentationObject;
  id?: string;
  title?: string;
  summaryFields?: string[];
  routes?: Routes;
  mcp?: boolean | MCPResourceOptions;
  [ext: string]: any;
}
```

| Field | Default | Effect |
|---|---|---|
| `name` | the class name, camelcased and capitalized | The OpenAPI tag, the scope name, and the prefix of every `operationId` |
| `namePlural` | `name + 's'` | Source of `basePath`, and of the generated summaries ("Retrieve a list of Users") |
| `path` | `decamelize(namePlural, '-')` | The base path, without a leading slash |
| `description` | — | The tag's `description` |
| `externalDocs` | — | The tag's `externalDocs` |
| `id` | — | Emitted as `x-id` on the tag. On [`MongoResource`](mongo-resource.md) it means something else entirely: the name of the identifying field |
| `title` | — | Emitted as `x-title` on the tag |
| `summaryFields` | — | Emitted as `x-summary-fields` on the tag |
| `mcp` | — | Opt into the [MCP server](mcp.md): `true` for every operation in the default bundle, or an options object |

The index signature means unknown properties are allowed and preserved: `info` doubles as a place to hang
your own configuration, which is how the smile.cx resources carry per-resource behaviour.

Note the default plural is a naive `+ 's'`: `Person` becomes `/persons`, `Category` becomes `/categorys`. Set
`namePlural` (or `path`) whenever English disagrees.

## `Routes`

```ts
interface Routes {
  [path: string]: { [method in Method]?: OperationFactory | APIRequestHandler };
}
interface OperationFactory {
  new (resource: Resource, path: string, method: Method): Operation;
}
```

Paths are Express paths relative to the resource base path (`/`, `/:id`, `/:id/history`). Each method maps
to either an `Operation` **class** — instantiated with `(resource, path, method)` — or a plain Express
handler, which gets wrapped in a [`SimpleOperation`](operation.md#simpleoperation).

## Properties

| Property | Type | Description |
|---|---|---|
| `info` | `ResourceDefinition` | The definition, after defaults have been applied |
| `api` | `API` | Set by [`attach`](#attach); `undefined` before the resource is added to an API |
| `operations` | `Operation[]` | `protected`. Use [`getOperations`](#getoperations) |

### `basePath`

```ts
get basePath(): string
```

`/` + `info.path`, or `/` + `decamelize(info.namePlural, '-')`. So `BlogPost` → `/blog-posts`,
`UserProfile` → `/user-profiles`.

### `scopeDescription`

```ts
get scopeDescription(): string
```

**override point.** The description of the resource-level OAuth2 scope. Defaults to
`Unrestricted access to all <namePlural>`.

## Methods

### `initInfo`

```ts
protected initInfo(): void
```

**override point.** Applies defaults to `info`, called from the constructor *before* routes are processed.
Override to derive defaults of your own; call `super.initInfo()` first.

### `addOperation`

```ts
addOperation(op: Operation): this
addOperation(path: string, method: Method, handler: OperationFactory | APIRequestHandler, id?: string): this
```

Adds an operation. The three-argument form decides which overload it got by checking whether `handler`'s
prototype is, or inherits from, `Operation.prototype` — so pass the **class**, not an instance:

```ts
resource.addOperation('/stats', 'get', StatsOperation);          // an Operation subclass
resource.addOperation('/ping', 'get', (req, res) => res.end()); // a handler → SimpleOperation
resource.addOperation(new StatsOperation(resource, '/stats', 'get')); // an instance
```

`id` applies only to the handler form, where it becomes the `SimpleOperation`'s `internalId`.

**Throws** on a missing method or handler.

Operations added after [`API.addResource`](api.md#addresource) are never attached, and so never appear in the
document. Add every operation before adding the resource to the API.

### `getOperations`

```ts
getOperations(): Operation[]
```

A copy of the operation list.

### `attach`

```ts
attach(api: API): void
```

Called by [`API.addResource`](api.md#addresource). Registers the tag (with `description`, `externalDocs`,
`x-id`, `x-title`, `x-summary-fields` as given), registers the resource-level OAuth2 scope named after
`info.name`, then attaches every operation.

### `router`

```ts
async router(base: Router, options?: RouterOptions): Promise<Router>
```

Builds a sub-router: every operation's routes first, then — for each distinct path any operation uses — a
catch-all `r.all(path, …)` answering `405 Method Not Allowed`. That fallback is why the *set* of paths
matters: a request to a known path with an unhandled method gets a 405 rather than falling through to a 404.

Mounted on `base` at [`basePath`](#basepath).

### `capitalize` (static)

```ts
static capitalize(s: string): string
```

## Subclassing

Overriding `Resource` is the standard way to build a reusable resource type. A typical shape:

```ts
class AuditedResource extends Resource {
  constructor(info: ResourceDefinition, routes = AuditedResource.getDefaultRoutes()) {
    super(info, routes);
  }
  static getDefaultRoutes(): Routes {
    return { '/': { get: ListOperation, post: CreateOperation } };
  }
  get scopeDescription(): string {
    return `Full access to ${this.info.namePlural}, audited`;
  }
}
```

When a subclass lets callers pass extra routes, merge them with the defaults **in path order** — most
specific first, parametric last — because Express matches in registration order. See
[Express integration](../guide/07-express-integration.md#route-order) and
[tutorial chapter 09](../tutorial/09-custom-resources.md).

---

[← API](api.md) · [Reference index](README.md) · [Operation →](operation.md)
