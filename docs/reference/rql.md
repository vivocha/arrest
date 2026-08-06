# RQL

Source: [src/mongo/rql.ts](../../src/mongo/rql.ts)

[Resource Query Language](https://github.com/persvr/rql) is the query dialect
[`QueryMongoOperation`](mongo-operations.md#querymongooperation) accepts in its `q` parameter. arrest parses it
with [`rql`](https://www.npmjs.com/package/rql)'s `parseQuery` and translates the result into a MongoDB filter.

```
GET /people?q=and(eq(status,active),gt(age,18),sort(-created),limit(0,20))
```

## The translation function

```ts
export default function (query: any, opts: any, data: string, objectId?: string): any
```

Not exported from the package root — `import rql from 'arrest/dist/mongo/rql.js'` if you need it directly
(see [utilities.md](utilities.md#importing-the-non-exported-modules)).

| Parameter | Meaning |
|---|---|
| `query` | The query to merge into. `QueryMongoOperation` passes `{}` and merges the result itself |
| `opts` | **Mutated**: `sort`, `select` and `limit` write `sort`, `fields`, `skip`/`limit` onto it |
| `data` | The RQL string |
| `objectId` | A field name whose values are cast to `ObjectId`. The query operation passes `info.id` when `idIsObjectId` |

Returns the filter, or `null` when the expression contributed nothing to it —
[`addConstraint`](utilities.md#addconstraint) treats `null` as an empty constraint.

## Comparison

| RQL | MongoDB |
|---|---|
| `eq(x,a)` | `{ x: 'a' }` |
| `ne(x,a)` | `{ x: { $ne: 'a' } }` |
| `lt(x,a)` | `{ x: { $lt: 'a' } }` |
| `le(x,a)` | `{ x: { $lte: 'a' } }` |
| `gt(x,a)` | `{ x: { $gt: 'a' } }` |
| `ge(x,a)` | `{ x: { $gte: 'a' } }` |
| `in(x,a,b,c)` | `{ x: { $in: ['a','b','c'] } }` |
| `out(x,a,b,c)` | `{ x: { $nin: ['a','b','c'] } }` |
| `contains(x,a)` | `{ x: 'a' }` |
| `contains(x,a,b,c)` | `{ x: ['a','b','c'] }` |
| `matches(x,pattern,flags?)` | `{ x: new RegExp(pattern, flags) }` |
| `text(term,language?)` | `{ $text: { $search: term, $language?: language } }` |

`contains` relies on MongoDB matching an array field against a scalar. With one argument it's the same
translation as `eq`; with several it becomes an **exact array match**, not "contains all of" — `contains(tags,a,b)`
matches a document whose `tags` is exactly `['a','b']`, in that order. For "has all of these", use
`and(contains(tags,a),contains(tags,b))`.

`text` needs a text index on the collection; declare it in
[`getIndexes`](mongo-resource.md#getindexes).

Values are whatever the RQL parser produced. It types unquoted numbers as numbers and `true`/`false` as
booleans, so `eq(age,18)` compares against the number and `eq(code,0018)` against a string. Dates are not
converted: comparing a `date-time` field needs the values stored as strings, or a `prepareQuery` override that
casts them.

### ObjectId casting

Only the field named by `objectId` is cast, and only by `eq`, `in` and `out`. So on a resource with the
default `_id`, `q=eq(_id,604784e36b026ce483a9a8ea)` matches, but `q=ne(_id,…)` compares the ObjectId against
a string and matches everything. Reference fields holding ObjectIds elsewhere in the document are never cast.

## Logic

| RQL | MongoDB |
|---|---|
| `and(a,b)` | the two constraints merged, `$and` only when needed |
| `or(a,b)` | `{ $or: [a, b] }` |
| `not(a)` | `{ $not: a }` |

`and` and `or` with a single argument collapse to that argument. `and` merges its arguments into one object
when none of them is itself an `and`/`or`, and uses `$and` when one is — so `and(eq(x,b),eq(y,c))` is
`{ x: 'b', y: 'c' }` while `and(and(eq(x,b),eq(y,c)),in(z,a,b))` is `{ $and: [{ x: 'b', y: 'c' }, { z: { $in: ['a','b'] } }] }`.

Arguments that translate to nothing are dropped from `$and`/`$or` lists, so
`and(and(eq(x,b)),aggregate())` is just `{ x: 'b' }`.

`not(a)` produces a top-level `$not`, which MongoDB only accepts as a *field-level* operator — so
`not(eq(x,b))` yields `{ $not: { x: 'b' } }` and the server rejects it. Express the negation directly:
`ne(x,b)`, `out(x,b)`, or `{ $nor: … }` via a `prepareQuery` override.

## Modifiers

These write to `opts` and contribute nothing to the filter (they return `null`):

| RQL | Effect |
|---|---|
| `sort(+a,-b)` | `opts.sort = ['+a','-b']`, converted to `{ a: 1, b: -1 }` by `prepareOpts` |
| `select(a,b)` | `opts.fields = ['a','b']`, which **takes precedence over** the `fields` parameter |
| `limit(skip,count)` | `opts.skip = skip`, `opts.limit = count` — note the argument order |

`limit`'s arguments are used verbatim, with no validation: `limit(a,b)` sets `skip` and `limit` to the strings
`'a'` and `'b'`, which the driver then rejects. Unlike the `limit` and `skip` **parameters**, which the default
document constrains to integers within a range, RQL modifiers bypass validation entirely. Prefer `?limit=`
and `?skip=` for paging driven by user input, and note that `resource.info.queryLimit` still clamps whatever
RQL asked for.

## Guards and silently ignored operators

`matches` rejects a pattern longer than **1000 characters**
(`RQL_MATCHES_MAX_PATTERN_LENGTH`) by throwing, which surfaces as `500 internal`. Invalid regex flags throw
too. That's a resource-exhaustion guard, not a sanitizer: `matches(x,(a+)+$)` is well under the limit and still
catastrophic. **Sanitizing RQL from untrusted input is the caller's responsibility** — RQL lets a client
address any field of any document the operation can reach, including fields excluded from the projection.

These operators parse but translate to nothing, and are **silently ignored**:

`aggregate` · `distinct` · `sum` · `mean` · `max` · `min` · `recurse` — and any name the parser accepts that
arrest doesn't handle.

So `?q=sum(total)` returns the unfiltered list rather than an error. A client can't tell a supported operator
from an ignored one; treat the table above as the whole language.

## Aggregation queries

RQL never produces an aggregation pipeline. What makes `job.query` an array is your own `prepareQuery`
override:

```ts
class Aggregation extends QueryMongoOperation {
  async prepareQuery(job: MongoJob): Promise<MongoJob> {
    await super.prepareQuery(job);
    job.query = [{ $match: job.query }, { $lookup: { /* … */ } }];
    return job;
  }
}
```

From there [`runOperation`](mongo-operations.md#runoperation) takes the `$facet` branch: your stages, then
`$sort`/`$project` from `opts`, then a `$facet` counting and paging in one round trip. RQL filters merged with
[`addConstraint`](utilities.md#addconstraint) land in the trailing `$match`, so `q` keeps working over an
aggregation.

## URL encoding

Two decodes happen, and both matter. Express decodes the query string, then the RQL parser decodes each value
again. So the encoding a *value* needs must survive the first decode — which means **values are encoded twice**,
while the structural `(`, `)` and `,` are encoded once (or not at all, if the client sends them raw).

```ts
const value = encodeURIComponent('Ada Lovelace');                 // Ada%20Lovelace
const url = `/people?q=${encodeURIComponent(`eq(name,${value})`)}`; // q=eq(name%2CAda%2520Lovelace)
```

The parser accepts `[a-zA-Z0-9_.*$+-]` in an unencoded value. **Anything else reaching it literally raises
`URIError: Illegal character in query string encountered`, which arrest reports as a `500`** — a space, `@`,
`^`, `(`, `)` or `,` inside a value all do this. Measured:

| Sent as | Reaches the parser as | Result |
|---|---|---|
| `q=eq(name,Ada%20Lovelace)` | `eq(name,Ada Lovelace)` | **500** — `URIError` |
| `q=eq(name,Ada+Lovelace)` | `eq(name,Ada+Lovelace)` | 200, matching the literal `"Ada+Lovelace"` — `+` is not a space here |
| `q=eq(name,Ada%2520Lovelace)` | `eq(name,Ada%20Lovelace)` | 200, matching `"Ada Lovelace"` ✅ |
| `q=eq(email,ada@example.com)` | same | **500** — `URIError` |
| `q=eq(email,ada%2540example.com)` | `ada%40example.com` | 200, matching `"ada@example.com"` ✅ |

`encodeURIComponent` per value, then let the HTTP library encode the whole `q`, and all five rows are the last
one. Note that `+` is taken literally rather than as a space, so it is never a shortcut.

---

[← Mongo operations](mongo-operations.md) · [Reference index](README.md) · [Schemas →](schemas.md)
