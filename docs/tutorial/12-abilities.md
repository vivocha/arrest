# 12 — Abilities and redaction

**Goal:** authorize not just *which operations* but *which records* and *which fields*, declaratively, and know
where the declaration stops being enough.

Scopes answer one question: may this caller run this operation? A [CASL](https://casl.js.org) ability answers two
more. Set `req.ability` instead of `req.scopes` and arrest translates the operation's scopes into CASL terms:
**the scope's category is the CASL subject, the scope's operation is the CASL action**. `Person.query` is
therefore `can('query', 'Person')`.

## The code

[examples/tutorial/src/steps/12-abilities.ts](../../examples/tutorial/src/steps/12-abilities.ts), with
`?role=reader|editor|admin` standing in for a real user:

```ts
class AbilityAPI extends API {
  initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction): void {
    const role = typeof req.query.role === 'string' ? req.query.role : 'reader';

    req.ability = defineAbility((can) => {
      if (role === 'admin') {
        can('manage', 'all');
      } else if (role === 'editor') {
        // every Person operation, every field, but only European records
        can(['query', 'read', 'create', 'update', 'patch', 'statistics'], 'Person', { country: { $in: ['GB', 'IT', 'NL'] } });
      } else {
        // read-only, and only these fields: `notes` and `age` never reach the client
        can(['query', 'read'], 'Person', ['_id', 'name', 'email', 'country', 'tags.**']);
      }
    }) as Ability;

    next();
  }
}
```

Note the `as Ability` assertion. `defineAbility` returns a `PureAbility` whose subject and action types are wider
than the `Ability` that `APIRequest.ability` declares; the assertion is the idiom arrest's own tests use.

## Run it

```bash
node dist/main.js 12
```

```bash
$ curl -s 'localhost:3000/people?role=reader&limit=1' | jq -c
[{"_id":"6a7440b3…","name":"Ada Lovelace","email":"ada@example.com","country":"GB","tags":[{"name":"maths"},{"name":"pioneer"}]}]

$ curl -s 'localhost:3000/people?role=admin&limit=1' | jq -c
[{"_id":"6a7440b3…","name":"Ada Lovelace","email":"ada@example.com","age":36,"country":"GB","tags":[…],"created":"2026-08-06T08:07:15.053Z"}]

$ curl -s 'localhost:3000/people?role=editor' | jq -c '[.[]|{name,country}]'
[{"name":"Ada Lovelace","country":"GB"},{"name":"Alan Turing","country":"GB"},
 {"name":"Federico Faggin","country":"IT"},{"name":"Rita Levi-Montalcini","country":"IT"},
 {"name":"Edsger Dijkstra","country":"NL"}]
```

One `initSecurity`, three behaviours. The reader lost `age` and `created`; the editor lost three of eight people.
Neither the resource nor any operation knows about roles.

## What just happened

### Three levels, three mechanisms

| Level | Declared as | Applied in | Failure |
|---|---|---|---|
| operation | `can(action, subject)` | `getAuthorizationError` | **403** (401 with no ability *and* no scopes) |
| record | the conditions object | `prepareQuery` → the Mongo query | **404** on a single read; absent from lists |
| field | the fields array | `redactResult` on the way out, `prepareDoc` on the way in | filtered out / **403** in |

They are genuinely independent. Confirm the first:

```bash
$ curl -s -X DELETE 'localhost:3000/people/6a7440b3…?role=reader'
{"error":403,"message":"insufficient privileges"}

$ curl -s 'localhost:3000/people/statistics?role=reader'
{"error":403,"message":"insufficient privileges"}
```

The reader has no `remove` and no `statistics` action, so both are refused before any query runs. Chapter 08's
custom operation needed no code for this: its scope is `Person.statistics`, which the ability check reads as
`can('statistics', 'Person')`.

### Record constraints become part of the query

```bash
$ curl -si 'localhost:3000/people?role=editor' | grep -i results-matching
Results-Matching: 5
$ curl -si 'localhost:3000/people?role=admin' | grep -i results-matching
Results-Matching: 8
```

`Results-Matching` says 5, not 8. The conditions were merged into `job.query` by
[`MongoOperation.prepareQuery`](../reference/mongo-operations.md#pipeline-steps), so the forbidden documents were
never read — this is not post-filtering. Two consequences follow.

**A single read of a record outside the conditions is a 404, not a 403:**

```bash
$ curl -s 'localhost:3000/people/<a US person>?role=editor'
{"error":404,"message":"not_found"}
```

Deliberate. A 403 would confirm the record exists, which is exactly what the conditions were meant to hide. Expect
this in your clients: with abilities, 404 means *not found or not yours*, and there is no way to tell them apart
from outside.

**And the aggregation in chapter 08 is constrained too**, because it called `super.prepareQuery`:

```bash
$ curl -s 'localhost:3000/people/statistics?role=editor' | jq -c
[{"count":2,"country":"GB",…},{"count":2,"country":"IT",…},{"count":1,"country":"NL",…}]

$ curl -s 'localhost:3000/people/statistics?role=admin' | jq -c
[{"count":3,"country":"US",…},{"count":2,"country":"GB",…},{"count":2,"country":"IT",…},{"count":1,"country":"NL",…}]
```

No `US` row for the editor. That is chapter 08's exercise 3 answered: drop the `super.prepareQuery` call and the
aggregation reports over all eight people while every other endpoint shows five. A statistics endpoint that leaks
counts over records the caller can't read is a real disclosure, and nothing about the code would look wrong.

### Field redaction, and where it happens

The reader's ability lists fields, and `redactResult` deletes everything else on the way out. Because that runs
*before* `processResult`, every output format inherits it:

```bash
$ curl -s 'localhost:3000/people?role=reader&format=csv&csv_fields=name,age,country&limit=3'
Ada Lovelace,,GB
Alan Turing,,GB
Grace Hopper,,US
```

The `age` column is present and empty — `csv_fields` asked for a field the ability removed. That is the same
blank-column behaviour chapter 07 measured for an unresolvable path, arriving here for an authorization reason.

Note `tags.**` in the reader's field list. CASL patterns apply: `**` matches any depth below `tags`, `*` one
level. Without it the whole array would be gone, because `checkAbility` walks to the leaves and checks each with
its dotted path (`tags.name`) — the array index is deliberately *not* part of the path, which is what lets one
rule permit a whole uniform array.

### On the way in, forbidden fields are refused — not dropped

Measured with an ability granting only `_id`, `name` and `email`:

```bash
$ curl -s -X POST localhost:3000/people -d '{"name":"P1","email":"p1@x.com","age":9}'
{"error":403,"message":"insufficient privileges"}

$ curl -s -X PUT localhost:3000/people/6a7440b3… -d '{"name":"Ada Lovelace","email":"ada@example.com","age":99}'
{"error":403,"message":"insufficient privileges"}
```

Both throw. The asymmetry worth internalizing is not between `POST` and `PUT` — it is between the two
*directions*: a response is filtered silently, because there is nobody to tell, while a request asking for
something it may not have is refused. No write path drops a field quietly, so a client is never left believing it
wrote a value that was discarded.

`PATCH` is checked per path, before any document is in hand, and names the offending op:

```bash
$ curl -s -X PATCH localhost:3000/people/6a7440b3… -d '[{"op":"replace","path":"/age","value":99}]'
{"error":403,"message":"insufficient privileges","info":{"op":"replace","path":"/age","value":99}}

$ curl -s -X PATCH localhost:3000/people/6a7440b3… -d '[{"op":"replace","path":"/name","value":"Ada Lovelace"}]'
{"_id":"6a7440b3…","name":"Ada Lovelace","email":"ada@example.com"}
```

That is [`checkAbilityForPath`](../reference/authorization.md#checkabilityforpath) — the only ability API that
takes a path and no data, which is precisely what a JSON Patch gives you.

### Introspection: `permittedFields`

```ts
queryOperation.permittedFields(readerAbility);   // Set { '_id', 'name', 'email', 'country', 'tags.**' }
queryOperation.permittedFields(adminAbility);    // Set { '**' }
removeOperation.permittedFields(readerAbility);  // Set {}
```

Rules, not a decision about data — useful for building a projection, or telling a client what it may send. `**`
means unrestricted. Note the empty set for an operation the ability doesn't permit at all: `permittedFields`
reports *fields*, so "no fields" and "no permission" look the same. Ask
[`isAuthorized`](../reference/operation.md#isauthorized) for the latter.

### Abilities beat scopes, and `?filter=authorized` follows

When both `req.ability` and `req.scopes` are set, `getAuthorizationError` checks the ability and **never looks at
the scopes**. Don't set both expecting them to intersect.

Document filtering works identically to chapter 11, because it is the same decision:

```bash
$ curl -s 'localhost:3000/openapi.json?filter=authorized&role=reader' | jq -r '.paths|keys[]'
/people
/people/{id}
/schemas/{id}

$ curl -s 'localhost:3000/openapi.json?filter=authorized&role=reader' | jq -r '.paths."/people/{id}"|keys|join(",")'
get
```

The reader is shown one method on `/people/{id}` and no `/people/statistics`. Note what filtering can *not* do:
it works at operation granularity, so a reader still sees the full `person` schema including `age` and `notes`,
fields it will never receive. Field-level rules don't reshape the document.

### The trap: inverted rules with conditions

This is the one place the ability model will hand you a 500. CASL documentation suggests expressing "everything
except" as a `cannot` with conditions:

```ts
can(['query', 'read'], 'Person');
cannot(['query', 'read'], 'Person', { country: { $nin: ['GB', 'IT', 'NL'] } });   // ← every query is a 500
```

```bash
$ curl -s localhost:3000/people
{"error":500,"message":"internal"}
```

The cause is in [`toMongoQuery`](../reference/utilities.md#tomongoquery), which reads `out.$or.length` without
checking that `$or` exists. When the only *conditional* rules for an action are inverted ones, `@casl/ability`'s
`rulesToQuery` returns a `{$and: […]}` with no `$or`, and the read throws. Measured, per rule shape:

| Rules for `query`/`Person` | `toMongoQuery` |
|---|---|
| `can`, no conditions | `{}` |
| `can` with conditions | `{"country":{"$in":["GB"]}}` |
| two `can`s with conditions | `{"$or":[…,…]}` |
| `can(cond)` + `cannot(cond)` | `{"$or":[…],"$and":[{"$nor":[…]}]}` |
| `can` (no cond) + `cannot(cond)` | **TypeError → 500** |
| no rules at all | **TypeError → 500** — but unreachable, since the operation 403s first |

So: **write conditions positively.** `can([…], 'Person', { country: { $in: [...] } })` is what the example does,
and it is equivalent for this purpose. Keep `cannot` for whole actions (`cannot('remove', 'Person')`), where it
has no conditions to convert.

### Where to put the ability

`initSecurity` is the only place arrest reads it from, but the shape that scales is a function of the
authenticated user, cached per request:

```ts
initSecurity(req: APIRequest, res: APIResponse, next: NextFunction): void {
  this.verifyToken(req)
    .then((user) => {
      req.ability = abilityFor(user) as Ability;      // pure function of the claims, unit-testable
      next();
    })
    .catch(() => next(API.newError(401, 'invalid token')));
}
```

Two rules from practice. Build the ability from **claims already in the token**, not from a database read — this
runs on every request, including `openapi.json`. And keep `abilityFor` a pure function, so the interesting part is
testable without an HTTP server; that is where the rules deserve tests, not through curl.

## Exercises

1. Give the reader `age` and re-run the CSV request. Which column filled in, and where was it filtered?
2. Add `cannot('remove', 'Person')` to the admin's `manage all` and confirm the DELETE becomes a 403 while the
   rest stays open.
3. Write the editor's rule as a `cannot` with conditions and reproduce the 500. Then read the stack trace.
4. Remove `super.prepareQuery` from `PersonStatisticsOperation` and compare the editor's statistics with the
   editor's list. How would a test have caught this?
5. Restrict `tags.**` to `tags.name` and look at what a person's `tags` array becomes.

---

[← Chapter 11](11-scopes.md) · [Tutorial index](README.md) · [Chapter 13 →](13-mcp.md)
