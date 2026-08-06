# 09 — Custom resources

**Goal:** build a resource with no database behind it, and understand what a `Resource` actually is.

Chapter 08 added an operation to a generated resource. This one goes the other way: a resource that generates
nothing. In the production codebase this manual was checked against, `extends Resource` appears in 37 files and
`extends MongoResource` in **zero** — every collection-backed resource is a plain `new MongoResource(db, {…})`,
and every subclass is a hand-written one. This is the common shape, not the exotic one.

## The code

[examples/tutorial/src/resources/token.ts](../../examples/tutorial/src/resources/token.ts), trimmed to the
structure:

```ts
class CreateTokenOperation extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'create');
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Exchange credentials for a token',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 8 },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: { '200': { … } },
    };
  }

  async handler(req: APIRequest, res: APIResponse): Promise<void> {
    const { email } = req.body;
    res.json({ token: Buffer.from(`${email}:tutorial`).toString('base64url'), expiresIn: 3600 });
  }
}

class CurrentTokenOperation extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'current');
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject { … }
  async handler(req: APIRequest, res: APIResponse): Promise<void> {
    res.json({ scopes: req.scopes ? '' + req.scopes : null, authenticated: !!req.scopes });
  }
}

export class TokenResource extends Resource {
  constructor() {
    super({
      name: 'Token',
      namePlural: 'Tokens',
      description: 'Issuing and inspecting tokens',
      routes: {
        '/': { post: CreateTokenOperation },
        '/current': { get: CurrentTokenOperation },
      },
    });
  }

  get scopeDescription(): string {
    return 'Full access to token issuing and inspection';
  }
}
```

Note `Operation`, not `MongoOperation` — so `handler` rather than `runOperation`, and no pipeline. And note
`routes` **inside** the definition object, which is the third way to give a resource its operations. All three are
equivalent:

```ts
super({ name: 'Token', routes: { … } });              // in the definition
super({ name: 'Token' }, { … });                      // as the second argument
this.addOperation(new CreateTokenOperation(this, '/', 'post'));   // imperatively
```

Passing both of the first two throws `double routes specification`. Pick one.

## Run it

```bash
node dist/main.js 09
```

```bash
$ curl -s -X POST localhost:3000/tokens -H 'content-type: application/json' \
    -d '{"email":"ada@example.com","password":"hunter22"}'
{"token":"YWRhQGV4YW1wbGUuY29tOnR1dG9yaWFs","expiresIn":3600}

$ curl -s localhost:3000/tokens/current
{"scopes":"*.*","authenticated":true}
```

`*.*` is the default `initSecurity` granting everything — chapter 11 replaces it.

The validation came from the `requestBody` schema, with no `registerSchema` involved:

```bash
$ curl -s -X POST localhost:3000/tokens -H 'content-type: application/json' \
    -d '{"email":"ada@example.com","password":"short"}'
{"error":400,"message":"ValidationError","info":{"type":"properties","path":"body",
 "scope":"…#/paths/~1tokens/post/requestBody/content/application~1json/schema",
 "errors":[{"type":"minLength","path":"body/password", …}]}}

$ curl -s -X POST localhost:3000/tokens -H 'content-type: application/json'
{"error":400,"message":"ValidationError","info":{"type":"required","path":"body","scope":""}}
```

An inline schema is fine for a body used once. Register it when two operations share it, or when clients should
be able to generate a type for it.

## What just happened

### A `Resource` is four things

Adding `TokenResource` to the API produced exactly this much:

1. **a base path** — `/tokens`, from `namePlural`;
2. **a tag** — `{"name":"Token","description":"Issuing and inspecting tokens"}` in `document.tags`;
3. **a scope** — `Token`, described by `scopeDescription`, for chapter 11;
4. **its operations**, attached in order, each registering its own path, `operationId` and scope.

Plus one behaviour: **the 405 fallback**. `Resource.router` collects the distinct paths its operations use and
registers an `r.all(path, …)` on each *after* them, which answers any method nothing else claimed:

```bash
$ curl -si localhost:3000/tokens | head -1                 # no GET declared
HTTP/1.1 405 Method Not Allowed

$ curl -si -X PUT localhost:3000/tokens/current | head -1
HTTP/1.1 405 Method Not Allowed
```

That is why the framework gives a 405 rather than a 404 for an unimplemented method — and why declaring paths
matters: an unknown path under the same resource is still a 404, because no operation claimed it and there is no
`all` handler for it.

```bash
$ curl -s localhost:3000/tokens/nope
{"error":404,"message":"Not Found","info":"the requested resource cannot be found, check the endpoint URL"}
```

Two things follow. `HEAD` works on any `GET` (Express handles that), while `OPTIONS` is a 405 — arrest declares no
CORS preflight handling, so if you need it, add the middleware yourself before mounting the router. And a
parametric path in the same resource swallows the fallback:

```bash
$ curl -s -X DELETE localhost:3000/people/statistics
{"error":404,"message":"not_found"}          # not the 405 you'd expect
```

`/people/:id` has a `delete`, so it matched first, and `RemoveMongoOperation` tried to turn `statistics` into an
`ObjectId`. The 405 fallback never got a look in.

### The name derivation, in full

Four measured cases, since this is the part people get wrong:

| `name` | `namePlural` | `basePath` | Tag | `operationId` prefix |
|---|---|---|---|---|
| `Token` | `Tokens` | `/tokens` | `Token` | `Token.` |
| `Person` | `People` (given) | `/people` | `Person` | `Person.` |
| `AccessToken` | `AccessTokens` (derived) | `/access-tokens` | `AccessToken` | `AccessToken.` |
| `Analytics` | `Analytics` (given) | `/analytics` | `Analytics` | `Analytics.` |

The rules:

- no `name`? it is derived from the **class name** — `class AccessToken extends Resource` gives `AccessToken`, so
  a minified or renamed class silently renames your API. Always pass `name`;
- no `namePlural`? it is `name + 's'`. Correct for `Token`, wrong for `Person` and `Analytics`. Pass it whenever
  English disagrees with `+ 's'`;
- `basePath` is `namePlural` decamelized with **hyphens** — note this differs from `MongoResource`'s `collection`
  default, which decamelizes with **underscores**. `BlogPosts` is served at `/blog-posts` out of collection
  `blog_posts`;
- `path` in the definition overrides `basePath` only. The tag, the scope and the `operationId`s still come from
  `name`.

Nothing deduplicates tags, incidentally: add two resources with the same `name` and `document.tags` has two
entries with that name. The operations still merge under one tag in any renderer, but the document is malformed.
One `name` per resource.

### Where to put shared behaviour

`Resource` gives you two override points worth knowing:

```ts
get scopeDescription(): string {
  return 'Full access to token issuing and inspection';    // instead of "Unrestricted access to all Tokens"
}

attach(api: API): void {
  super.attach(api);          // registers the tag, the scope and every operation — never skip it
  api.registerSchema('token', TOKEN_SCHEMA);   // a resource that brings its own schema
}
```

`attach` is the hook for anything a resource needs *in the API* rather than in a request: registering schemas it
owns, adding a security scheme, reading configuration off `api`. It runs once, at `addResource` time, before the
router is built — so it is also the last moment at which you can still change the document.

For a resource that owns several operations sharing setup, the pattern is a protected method on the resource that
the operations call through `this.resource`:

```ts
class TokenResource extends Resource {
  async verify(token: string): Promise<Claims> { … }
}

// in an operation:
const claims = await (this.resource as TokenResource).verify(req.headers.authorization!);
```

The cast is the price of `Operation.resource` being typed as `Resource`. `MongoOperation` does the same thing the
other way round, narrowing `resource` to `MongoResource` in its constructor — do that in your own base class if
you write several operations against one resource type.

### Mixing generated and hand-written routes

Chapter 08's resource is the mixed case, and it is worth stating the general form. To combine a generated CRUD
set with your own operations, build the route table explicitly:

```ts
new PersonResource(db, {
  '/statistics': { get: PersonStatisticsOperation },   // specific first
  '/export': { get: PersonExportOperation },
  ...MongoResource.defaultRoutes(),                     // then '/' and '/:id'
});
```

To *remove* something generated, take the table apart:

```ts
const routes = MongoResource.defaultRoutes();
delete routes['/:id'].patch;              // no PATCH — see chapter 06 on why you might want this
delete routes['/:id'].delete;
new PersonResource(db, routes);
```

`defaultRoutes()` returns a fresh object each call, so mutating it is safe. And to replace one generated
operation with a subclass of it, assign over the entry:

```ts
routes['/'].get = MyQueryOperation;       // extends QueryMongoOperation
```

That last form is the one to reach for when a generated operation is *nearly* right — subclass it, override one
pipeline step, and keep the nine parameters and the documented responses.

## Exercises

1. Add `GET /tokens` listing nothing, and watch the 405 become a 200. Which path did the fallback stop covering?
2. Give `TokenResource` a `path: 'auth'` and check what changed in the document and what didn't.
3. Register the token response body as a named schema in `attach` and `$ref` it from both operations.
4. Build a `PersonResource` with no `PATCH` and confirm `PATCH /people/{id}` is a 405 rather than a 404.
5. Two resources both named `Report`. Look at `document.tags`, then decide what you'd do about it.

---

[← Chapter 08](08-custom-operations.md) · [Tutorial index](README.md) · [Chapter 10 →](10-pipeline.md)
