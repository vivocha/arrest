# 06 — Updating

**Goal:** understand what `PUT` and `PATCH` actually do to a document, and when each is the right one.

## The code

The two operations came with the resource in chapter 03. This chapter adds one thing —
[examples/tutorial/src/steps/06-updating.ts](../../examples/tutorial/src/steps/06-updating.ts):

```ts
api.addResource(new PersonResource(db));

api.addResource(
  new MongoResource(db, {
    name: 'Setting',
    namePlural: 'Settings',
    description: 'A bag of settings with user-chosen keys',
    collection: 'settings',
    escapeProperties: true,
  })
);
```

A second resource, deliberately without a schema, to demonstrate `escapeProperties` at the end.

## PUT replaces — except it doesn't

```bash
$ curl -s localhost:3000/people/6a74393d2aa88051d09c2df6
{"_id":"…","name":"Ada Lovelace","email":"ada@example.com","age":36,"country":"GB",
 "tags":[{"name":"maths"},{"name":"pioneer"}],"created":"2026-08-06T07:35:25.947Z"}

$ curl -s -X PUT localhost:3000/people/6a74393d2aa88051d09c2df6 \
    -H 'content-type: application/json' -d '{"name":"Ada L.","email":"ada@example.com"}'
{"_id":"…","name":"Ada L.","email":"ada@example.com","age":36,"country":"GB",
 "tags":[{"name":"maths"},{"name":"pioneer"}],"created":"2026-08-06T07:35:25.947Z"}
```

The body left out `age`, `country` and `tags`, and they are all still there.

That is because `UpdateMongoOperation` issues a `findOneAndUpdate` with **`$set`**, not a `replaceOne`. HTTP says
`PUT` replaces the resource; arrest merges. It is a documented deviation and a deliberate one — a merge is what
clients almost always mean, and it keeps fields the client's schema version doesn't know about — but if you are
reasoning from the HTTP specification you will get this wrong.

The practical consequence: **there is no way to remove a field with `PUT`.** Sending `{"country": null}` sets it
to `null`, and omitting it leaves it alone. To delete a field you need `PATCH`.

`readOnly` properties in the body are still stripped, as chapter 04 measured, so a client can safely `GET` a
record, edit one field and `PUT` the whole object back — `_id` and `created` come along and are quietly
discarded.

A `PUT` to an id that doesn't exist is a 404. There is no upsert.

## PATCH is JSON Patch

Not "a partial object" — [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902), an array of operations:

```bash
$ curl -s -X PATCH localhost:3000/people/… -H 'content-type: application/json' \
    -d '[{"op":"replace","path":"/age","value":37}]'
{… "age":37 …}

$ curl -s -X PATCH localhost:3000/people/… -H 'content-type: application/json' \
    -d '[{"op":"add","path":"/tags/-","value":{"name":"analyst"}}]'
{… "tags":[{"name":"maths"},{"name":"analyst"}] …}

$ curl -s -X PATCH localhost:3000/people/… -H 'content-type: application/json' \
    -d '[{"op":"remove","path":"/country"}]'
{… no country …}
```

That third one is the reason `PATCH` exists in this API: it is the only way to unset a field.

### The content type is `application/json`

```bash
$ curl -s -X PATCH … -H 'content-type: application/json-patch+json' -d '[{"op":"replace", …}]'
{"error":400,"message":"ValidationError","info":{"type":"type","path":"body", …}}
```

RFC 6902 defines `application/json-patch+json`, and arrest does **not** accept it: the operation declares its
body as `application/json` only, so a correct client sending the correct media type gets a 400. Send
`application/json`.

### Which operations are supported

| `op` | Supported | Becomes |
|---|---|---|
| `add` | yes | `$set`, or `$push` when the path ends in `/-` |
| `replace` | yes | `$set`, plus an `$exists: true` guard on the path |
| `remove` | yes | `$unset` |
| `move` | yes | `$rename` |
| `test` | yes | a condition added to the query |
| `copy` | **no** | rejected by the body schema |

The whole patch becomes **one** `findOneAndUpdate`, which is what makes it atomic. That is the good news; the
consequences are the rest of this section.

### `test` and `replace` are query conditions, not sequenced steps

RFC 6902 says operations apply in order and a failing `test` aborts the patch. arrest gets the *outcome* right
and the *mechanism* different: `test` contributes a condition to the query rather than being evaluated in
sequence.

```bash
$ curl -s -X PATCH localhost:3000/people/… -H 'content-type: application/json' \
    -d '[{"op":"test","path":"/age","value":999},{"op":"replace","path":"/name","value":"NOPE"}]'
{"error":404,"message":"not_found"}
```

The `test` failed, so nothing was modified — correct. But the error is a **404**, because what actually happened
is that the query `{_id: …, age: 999}` matched no document. So a failed precondition is indistinguishable from a
missing record. If you use `test` for optimistic concurrency — and it is the right tool for that — your client
has to treat 404 as "either gone or changed under me" and re-read.

This also means the ordering semantics differ from the RFC in ways that matter for patches that touch the same
path twice: a `[{test:/a,1},{replace:/a,2},{test:/a,2}]` sequence is legal per the RFC and impossible here, since
both `test`s become conditions on the same field of the same query. Keep patches simple.

`replace` adds an `$exists: true` guard on its path, so replacing a field that isn't there is also a 404 rather
than an add. That is per the RFC, and it is the one precondition you get for free.

### The patch body is validated; the result is not

```bash
$ curl -s -X PATCH … -d '[{"op":"frobnicate","path":"/age","value":1}]'
{"error":400,"message":"ValidationError", … "type":"oneOf" …}     # good

$ curl -s -X PATCH … -d '[{"op":"replace","path":"/age","value":999}]'
{… "age":999 …}                                                    # 200. The schema says maximum: 150.
```

The `requestBody` schema of a patch operation describes *JSON Patch*, not your resource — it checks that each
element is a well-formed operation. It cannot check the outcome, because the outcome isn't known until the
document is read, and arrest doesn't read it first.

So `PATCH` bypasses your resource schema entirely. On an API where invariants matter, that is a real hole and you
have three options: don't expose `PATCH` (drop it from the route table — chapter 08 shows how), subclass
`PatchMongoOperation` and validate the resulting document in `runOperation`, or accept it. Chapter 12's abilities
do at least constrain *which paths* a caller may patch, which is checked per-operation before the update runs.

## `escapeProperties`

MongoDB will not store keys containing `.` or `$`, and a key with `%` collides with the escaping scheme. So a
document whose keys are user-chosen — a settings bag keyed by hostname, feature flags keyed by identifier — needs
escaping. Set `escapeProperties: true` on the resource:

```bash
$ curl -s -X POST localhost:3000/settings -H 'content-type: application/json' \
    -d '{"name":"per-host","values":{"api.example.com":{"timeout":30},"$special":1,"100%":"pct"}}'
{"name":"per-host","values":{"api.example.com":{"timeout":30},"$special":1,"100%":"pct"},"_id":"…"}

$ curl -s localhost:3000/settings/…
{"_id":"…","name":"per-host","values":{"api.example.com":{"timeout":30},"$special":1,"100%":"pct"}}
```

Round-trips exactly. And in the database:

```js
{ _id: …, name: 'per-host',
  values: { 'api%2Eexample%2Ecom': { timeout: 30 }, '%24special': 1, '100%25': 'pct' } }
```

`.` → `%2E`, `$` → `%24`, `%` → `%25`, applied to keys at every depth and reversed on the way out. Patch paths are
escaped too, so `{"op":"replace","path":"/values/api.example.com/timeout","value":60}` finds the right key.

Two things to keep in mind. Queries are **not** escaped: `?q=eq(values.api.example.com.timeout,30)` won't match,
because the RQL path is passed through unescaped — you'd have to write the escaped key yourself. And it applies
to the whole resource, so turning it on later means existing documents have unescaped keys that now read back
wrong. Decide per collection, at the start.

The example gives that resource no schema on purpose: arbitrary keys and `additionalProperties: false` are
contradictory. Use `{ type: 'object', additionalProperties: … }` if you want to constrain the *values*.

## Exercises

1. `PUT` a body containing only `{"name":"…"}` with no `email`. It's a 400 — `required` applies to the whole
   body, so `PUT` needs the complete object even though it merges.
2. Use `test` for optimistic concurrency: read a person, `PATCH` with a `test` on the value you read, and have a
   second terminal change it in between. What does the client see?
3. `move` a field with `PATCH` and check what happened in the database. Does the `$rename` survive a
   `readOnly` path?
4. Send a two-element patch where the second op depends on the first (`add /a`, then `replace /a`). Reason about
   what the single `findOneAndUpdate` did.

---

[← Chapter 05](05-querying.md) · [Tutorial index](README.md) · [Chapter 07 →](07-output-formats.md)
