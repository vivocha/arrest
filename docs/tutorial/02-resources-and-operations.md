# 02 — Resources and operations

**Goal:** replace the plain handler with a real `Operation` subclass, so it can describe itself — and get
parameter validation for free as a result.

## The code

[examples/tutorial/src/steps/02-resources-and-operations.ts](../../examples/tutorial/src/steps/02-resources-and-operations.ts):

```ts
class GreetOperation extends Operation {
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Greet someone by name',
      parameters: [
        {
          name: 'name',
          in: 'query',
          description: 'Who to greet',
          schema: { type: 'string', minLength: 1, default: 'world' },
        },
      ],
      responses: {
        '200': {
          description: 'The greeting',
          content: {
            'application/json': {
              schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' } } },
            },
          },
        },
      },
    };
  }

  handler(req: APIRequest, res: APIResponse) {
    res.json({ message: `Hello, ${req.query.name}` });
  }
}

class GreetingResource extends Resource {
  constructor() {
    super({
      name: 'Greeting',
      namePlural: 'Greetings',
      description: 'Says hello, with and without a name',
    });
    this.addOperation(new GreetOperation(this, '/', 'get'));
  }
}
```

and, in `createApi`:

```ts
api.addResource(new GreetingResource());

// `path` bypasses the name-based derivation entirely, so this is /health and not /healths
api.addResource(
  new Resource(
    { name: 'Health', path: 'health' },
    { '/': { get: (req: APIRequest, res: APIResponse) => res.json({ status: 'ok' }) } }
  )
);
```

## Run it

```bash
node dist/main.js 02
```

```bash
$ curl -s 'localhost:3000/greetings'
{"message":"Hello, world"}

$ curl -s 'localhost:3000/greetings?name=Ada'
{"message":"Hello, Ada"}

$ curl -s 'localhost:3000/health'
{"status":"ok"}
```

The first response is the interesting one: nothing in `handler` supplies `'world'`. The parameter declared a
`default`, and the validator applied it before the handler ran.

## What just happened

### `getCustomInfo` is the extension point

An operation's OpenAPI definition is assembled once, at attach time, from two pieces: `getDefaultInfo()`, which
the base classes implement (this is where `MongoOperation` gets its `q`/`limit`/`skip` parameters), and
`getCustomInfo()`, which is yours. They are deep-merged, yours winning.

So override `getCustomInfo` — not `getDefaultInfo`, and not `info`. That is not a style preference: it is how
you add a parameter to a Mongo operation without losing the five it already has. In production arrest code this
is by far the most-overridden method in the framework.

What you put there is plain OpenAPI 3.1. There is no arrest-specific dialect to learn.

### Declaring a parameter created a validator

`parameters` in the definition does double duty. It documents the parameter, and it builds a validator that runs
as middleware before your handler. By the time `handler` executes:

- `req.query.name` has been checked against `{ type: 'string', minLength: 1 }`;
- the `default` has been applied if the parameter was absent;
- for non-string types, the value has been **coerced** — a `{ type: 'integer' }` query parameter arrives as a
  number, not `"42"`.

That last point matters more than it sounds. Query strings are strings; a framework that hands you `"42"` makes
every handler start with a parse. arrest's validators are [openapi-police](https://github.com/vivocha/openapi-police)
`ParameterObject`s, which coerce as they validate.

Two behaviours worth knowing before they surprise you:

```bash
$ curl -s 'localhost:3000/greetings?bogus=1'
{"message":"Hello, world"}          # undeclared parameters are ignored, not rejected

$ curl -s 'localhost:3000/greetings?name='
{"message":"Hello, undefined"}      # an empty value is *not* the default
```

An undeclared query parameter is simply not validated — arrest validates what you declare and leaves the rest
of `req.query` alone. And `?name=` is an empty string, which the `simple` style parses to `undefined`; since
the parameter isn't `required`, validation passes and no default is applied, because the default only fills in a
parameter that was missing. If you need `?name=` to be an error, mark the parameter `required` — required plus
an empty value is a 400.

### Where the response schema goes

The `200` response you declared is in the document, and the `default` error response is still there beside it —
merged in by `getDefaultInfo`. But note what arrest does *not* do with your `200`: it does not validate the
response against it. **Response schemas are documentation.** Nothing arrest sends is checked on the way out.
That is a deliberate performance decision, and it is why chapter 10 has to strip a field by hand rather than
relying on the schema to do it.

### `addOperation` vs the route table

Two ways to give a resource its operations:

```ts
// a route table, in the definition or as the constructor's second argument
new Resource({ name: 'Health', path: 'health' }, { '/': { get: handlerOrClass } });

// or imperatively, from a subclass constructor
this.addOperation(new GreetOperation(this, '/', 'get'));
```

The route table's values can be a handler function, an `Operation` **class** (arrest constructs it as
`new Class(resource, path, method)`), or an instance. The class form is the common one, and its constraint shows
up in chapter 10: since arrest does the constructing, there is no way to pass an operation anything extra — a
database handle, say. That's when you construct it yourself and use `addOperation`.

Order is the other difference, and it bites in chapter 08: **routes are registered in the order they are
declared**, and `addOperation` appends.

### `path` overrides the derivation

`{ name: 'Health', path: 'health' }` serves `/health`. Without `path` it would be `/healths`, since the name is
singular and arrest pluralizes. Use `path` for endpoints whose URL is a fixed part of your API's contract, and
the name-based derivation for genuine collections.

Note that only the *path* is overridden. The tag is still `Health` and the scope is still `Health` — those come
from `name`.

### The resource description became a tag description

```json
"tags": [
  { "name": "Greeting", "description": "Says hello, with and without a name" },
  { "name": "Health" },
  { "name": "Schema" }
]
```

A [`ResourceDefinition`](../reference/resource.md#resourcedefinition) *is* an OpenAPI tag object plus arrest's
own fields, so `description` and `externalDocs` land in the tag. That's what a documentation renderer groups
your endpoints by, so it's worth a sentence.

## Exercises

1. Make the `name` parameter `required: true` and watch `curl localhost:3000/greetings` become a 400. Look at
   the error body: which field of it names the parameter?
2. Add an `{ in: 'header', name: 'x-lang' }` parameter and confirm it appears in `req.headers`. Note that header
   parameters are validated *before* path and query ones.
3. Add a second operation on `/{id}` and check the document renders it with braces while Express matched
   `:id`.
4. Override `getDefaultInfo` instead of `getCustomInfo` on `GreetOperation` and see what disappears from the
   document. (Then put it back.)

---

[← Chapter 01](01-first-api.md) · [Tutorial index](README.md) · [Chapter 03 →](03-mongodb.md)
