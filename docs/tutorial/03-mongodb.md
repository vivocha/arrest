# 03 — Persistence with MongoDB

**Goal:** a complete CRUD API over a MongoDB collection, from one object literal.

You need MongoDB running from here on — see [chapter 00](00-setting-up.md#what-you-need).

## The code

[examples/tutorial/src/steps/03-mongodb.ts](../../examples/tutorial/src/steps/03-mongodb.ts), in full:

```ts
import { API, MongoResource } from 'arrest';
import { getDb } from '../db.js';

export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  api.addResource(
    new MongoResource(db, {
      name: 'Person',
      namePlural: 'People',
      description: 'The people known to this API',
      collection: 'people',
    })
  );

  return api;
}
```

## Run it

```bash
node dist/main.js 03
```

```bash
$ curl -s localhost:3000/openapi.json | jq -r '.paths | keys[]'
/people
/people/{id}
/schemas/{id}
```

Six operations, from that one literal:

| | | `operationId` |
|---|---|---|
| `GET` | `/people` | `Person.query` |
| `POST` | `/people` | `Person.create` |
| `GET` | `/people/{id}` | `Person.read` |
| `PUT` | `/people/{id}` | `Person.update` |
| `PATCH` | `/people/{id}` | `Person.patch` |
| `DELETE` | `/people/{id}` | `Person.remove` |

They work:

```bash
$ curl -i -X POST localhost:3000/people \
    -H 'content-type: application/json' \
    -d '{"name":"Ada Lovelace","email":"ada@example.com","age":36}'
HTTP/1.1 201 Created
Location: http://localhost:3000/people/6a74385d82e8567748376e11
{"name":"Ada Lovelace","email":"ada@example.com","age":36,"_id":"6a74385d82e8567748376e11"}

$ curl -s localhost:3000/people/6a74385d82e8567748376e11
{"_id":"6a74385d82e8567748376e11","name":"Ada Lovelace","email":"ada@example.com","age":36}

$ curl -i -s localhost:3000/people | head -3
HTTP/1.1 200 OK
Results-Matching: 1

$ curl -i -X DELETE localhost:3000/people/6a74385d82e8567748376e11 | head -1
HTTP/1.1 200 OK
```

## What just happened

### `MongoResource` is a `Resource` with a default route table

Nothing magical: `MongoResource`'s constructor, given no routes, uses
[`MongoResource.defaultRoutes()`](../reference/mongo-resource.md#defaultroutes-static) —

```ts
{
  '/': { get: QueryMongoOperation, post: CreateMongoOperation },
  '/:id': {
    get: ReadMongoOperation,
    put: UpdateMongoOperation,
    delete: RemoveMongoOperation,
    patch: PatchMongoOperation,
  },
}
```

— which is the same route-table mechanism chapter 02 used by hand. That matters because it means you can take
that table apart: pass your own, add to it, remove from it. Chapters 08 and 09 do all three.

### `Location`, and the response headers

`POST` returns `201` with a `Location` header built from the request and the new id. `GET /people` sets
`Results-Matching` — the total count of matching documents, regardless of `limit` — and, when a page is not the
last, `Results-Skipped` and a `Link: <…>; rel="next"`. Chapter 05 uses them.

`DELETE` returns `200` with an empty body. Not `204`; arrest predates that being the fashion and changing it
would break clients.

### The id

`{id}` is the document's `_id`, converted to an `ObjectId` on the way in and to a string on the way out. Two
consequences visible immediately:

```bash
$ curl -s localhost:3000/people/not-an-objectid
{"error":404,"message":"not_found"}
```

An id that isn't a valid `ObjectId` is a **404, not a 400** — the operation tries the conversion, fails, and
reports the same "no such record" it would for a well-formed id that matches nothing. Distinguishing the two
would tell an unauthenticated caller what your ids look like.

If your documents use a natural key instead, set `id` and `idIsObjectId` in the definition:

```ts
new MongoResource(db, {
  name: 'Country',
  namePlural: 'Countries',
  collection: 'countries',
  id: 'code',            // the property used as the resource id
  idIsObjectId: false,   // don't try to convert it
});
```

`GET /countries/IT` then queries `{ code: 'IT' }`. arrest also wants a unique index on that property, which is
the subject of the next chapter.

### There is no schema yet

```bash
$ curl -s -X POST localhost:3000/people \
    -H 'content-type: application/json' -d '{"whatever":true,"nested":{"a":1}}'
{"whatever":true,"nested":{"a":1},"_id":"6a74385d82e8567748376e12"}
```

That was a 201. The resource's [`schema`](../reference/mongo-resource.md#schemas) getter defaults to `true` —
the JSON Schema that accepts everything — so the request body validator accepts everything, and the document
says `"schema": true` for both the body and the response. It is honest, at least: the document tells a client it
has no idea what a Person is.

Two more things follow from having no schema, and both are fixed in chapter 04:

```bash
$ curl -s -X POST localhost:3000/people -H 'content-type: text/plain' -d 'hello'
{"_id":"6a7438687d49c010ad7a2988"}          # 201, and an empty document
```

The body parser only parses `application/json`, so a `text/plain` body leaves `req.body` empty — and an empty
document satisfies `true`. With a schema that has `required` fields this is a 400.

And a create takes exactly one document:

```bash
$ curl -s -X POST localhost:3000/people -H 'content-type: application/json' -d '[{"name":"A"},{"name":"B"}]'
{"error":500,"message":"internal"}          # not a 400 — arrest doesn't guard this
```

An array body is a 500 rather than a validation error. A schema of `{ type: 'object' }` turns it into the 400 it
should be, which is one more reason to have one.

### `db` versus a connection string

The example passes a `Db`. `MongoResource` also accepts a string:

```ts
new MongoResource('mongodb://localhost:27017/arrest-tutorial', { … });
```

which is fine for one resource and wrong for ten: each resource then opens its own client and its own connection
pool to the same server. Connect once, share the `Db` — as [db.ts](../../examples/tutorial/src/db.ts) does.

Either way the connection is established lazily, on the first request that needs it, and cached. A `MongoResource`
constructed against a database that is down still starts up; the failure appears on the first request.

`collection` defaults to `namePlural` decamelized with underscores, so `collection: 'people'` above is
redundant — but `{ namePlural: 'BlogPosts' }` gives the collection `blog_posts` while the path is
`/blog-posts`, which is the kind of thing you want written down. Set it explicitly; it's the one line that says
where the data actually is.

## Exercises

1. `PUT` a document you created, then `GET` it. What happened to the fields you left out of the `PUT` body?
   (Chapter 06 is about that.)
2. Add a second `MongoResource` over a `notes` collection, with no `namePlural`. What path did you get?
3. `curl -s localhost:3000/openapi.json | jq '.paths."/people".get.parameters'` — nine parameters you didn't
   declare. Chapters 05 and 07 use all of them.
4. Try `?limit=2` on a collection with more than two documents and look at all the response headers.

---

[← Chapter 02](02-resources-and-operations.md) · [Tutorial index](README.md) · [Chapter 04 →](04-schemas-and-validation.md)
