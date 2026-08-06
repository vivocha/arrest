# 05 — Querying

**Goal:** get exactly the records and fields you want out of `GET /people`, without writing a query endpoint.

## The code

None. This is the chapter where the framework pays for itself: `QueryMongoOperation` already declared `q`,
`limit`, `skip`, `fields` and `sort` in chapter 03, and they have been working ever since.
[examples/tutorial/src/steps/05-querying.ts](../../examples/tutorial/src/steps/05-querying.ts) only seeds the
collection so there is something to query:

```ts
await seedPeople(db);
registerPersonSchema(api);
api.addResource(new PersonResource(db));
```

Eight people, from [seed.ts](../../examples/tutorial/src/seed.ts): Ada Lovelace and Alan Turing in `GB`, Grace
Hopper, Margaret Hamilton and Barbara Liskov in `US`, Rita Levi-Montalcini and Federico Faggin in `IT`, Edsger
Dijkstra in `NL`.

## Run it

```bash
node dist/main.js 05
```

### Projection

```bash
$ curl -s 'localhost:3000/people?fields=name,age'
[{"name":"Ada Lovelace","age":36},{"name":"Alan Turing","age":41}, …]
```

`fields` is a comma-separated list and becomes a MongoDB projection. Note `_id` is gone: as soon as you name any
field, `_id` is excluded unless you name it too. `fields=_id,name` gets it back.

The list is inclusive only — there is no `fields=-email` to mean "everything except". Exclusion is what chapter
12's abilities are for.

### Sorting

```bash
$ curl -s 'localhost:3000/people?sort=-age&fields=name,age'
[{"name":"Rita Levi-Montalcini","age":103},{"name":"Margaret Hamilton","age":88}, …]

$ curl -s 'localhost:3000/people?sort=country,name&fields=name,country'
[{"name":"Ada Lovelace","country":"GB"},{"name":"Alan Turing","country":"GB"},
 {"name":"Federico Faggin","country":"IT"}, …]
```

`-` for descending, `+` or nothing for ascending, comma-separated for multiple keys in order. A field that
doesn't exist is not an error; MongoDB sorts the missing values together.

### Filtering with RQL

`q` takes an [RQL](https://github.com/persvr/rql) expression, which arrest translates into a MongoDB query
object:

```bash
$ curl -s -G localhost:3000/people --data-urlencode 'q=eq(country,GB)'
Ada Lovelace, Alan Turing

$ curl -s -G localhost:3000/people --data-urlencode 'q=gt(age,80)'
Grace Hopper, Margaret Hamilton, Rita Levi-Montalcini, Federico Faggin, Barbara Liskov

$ curl -s -G localhost:3000/people --data-urlencode 'q=and(gt(age,80),eq(country,US))'
Grace Hopper, Margaret Hamilton, Barbara Liskov

$ curl -s -G localhost:3000/people --data-urlencode 'q=in(country,GB,IT)'
Ada Lovelace, Alan Turing, Federico Faggin, Rita Levi-Montalcini

$ curl -s -G localhost:3000/people --data-urlencode 'q=eq(tags.name,maths)'
Ada Lovelace, Alan Turing
```

The operators arrest translates:

| RQL | Mongo |
|---|---|
| `eq(f,v)` `ne(f,v)` | `{f: v}`, `{f: {$ne: v}}` |
| `lt` `le` `gt` `ge` | `$lt` `$lte` `$gt` `$gte` |
| `in(f,a,b)` `out(f,a,b)` | `$in` `$nin` |
| `and(…)` `or(…)` `not(…)` | `$and` `$or` `$not` |
| `matches(f,pattern[,flags])` | a `RegExp` |
| `text(words[,lang])` | `$text: {$search: …}` |
| `contains(f,v)` | `{f: v}` — Mongo's array-membership semantics |
| `sort(-a,b)` `select(a,b)` `limit(skip,count)` | not filters: they set the sort, projection and paging |

Dotted paths work, as `eq(tags.name,maths)` shows, and so does `in` — note the flat form `in(country,GB,IT)`,
not `in(country,(GB,IT))`, which parses as a nested term and matches nothing.

Three things to know before you hand `q` to a client:

**Percent-encode twice for anything RQL's grammar doesn't allow.** RQL's parser rejects characters outside its
own alphabet with a `URIError`, which arrest reports as a **500**:

```bash
$ curl -s -G localhost:3000/people --data-urlencode 'q=matches(name,^A)'
{"error":500,"message":"internal"}
```

The `^` reached the parser literally, because `--data-urlencode` encoded it for the URL and Express decoded it
again. RQL decodes values itself, so the encoding has to survive that first decode:

```bash
$ curl -s 'localhost:3000/people?q=matches(name,%255EA)'      # %25 5E — an encoded %5E
Ada Lovelace, Alan Turing
```

Same for `@`, spaces, and anything else outside `[a-zA-Z0-9_.*$+-]`. A client should
`encodeURIComponent` each *value* before assembling the RQL, and then let its HTTP library encode the query
string as usual. That a malformed `q` is a 500 rather than a 400 is a wart, not a design decision — treat any
500 from a query as "my RQL didn't parse".

**Unrecognized operators are silently dropped, not rejected.**

```bash
$ curl -s -G localhost:3000/people --data-urlencode 'q=distinct(country)'
… all eight people …
```

`aggregate`, `distinct`, `sum`, `mean`, `max`, `min` and `recurse` are part of RQL and *not* implemented here.
They contribute no constraint, so the query returns everything — the dangerous failure mode, because it looks
like it worked. If your API's clients might send them, validate `q` before it reaches arrest.

**`matches` is a regex, so it is a denial-of-service surface.** arrest caps the pattern at 1000 characters and
nothing else; a catastrophically backtracking pattern under that limit will still pin a CPU. If untrusted callers
can reach a query operation, either forbid `matches` in a `prepareQuery` override or put a
[`text`](https://www.mongodb.com/docs/manual/text-search/) index behind `text()` and use that instead.

### Paging

```bash
$ curl -si 'localhost:3000/people?limit=3&skip=0' | head -5
HTTP/1.1 200 OK
Results-Matching: 8
Link: <http://localhost:3000/people//?limit=3&skip=3>; rel="next"
```

- **`Results-Matching`** — how many documents match the filter, ignoring `limit`. Always set.
- **`Results-Skipped`** — echoes a non-zero `skip`.
- **`Link`** — the next page, in [RFC 5988](https://www.rfc-editor.org/rfc/rfc5988) form, present only when
  there is one. Only `rel="next"` — no `prev`, `first` or `last`.

A client that follows `Link` until it is absent pages correctly without arithmetic, which is the intended usage.
Two quirks to know if you do that: the URL contains a doubled slash (`/people//?limit=…`), which is harmless but
looks like a bug, and **the header is missing on the first page unless you send `skip` explicitly** — `?limit=3`
alone returns no `Link`, while `?limit=3&skip=0` returns one. Send `skip=0` on the first request.

Under the hood there are two strategies, and which one runs depends on whether `job.query` is an array (an
aggregation pipeline) or an object (a filter). For a plain filter arrest issues a `countDocuments` alongside the
`find`; for a pipeline it wraps the whole thing in a `$facet` that computes the count and the page in one round
trip. You get the same headers either way, but the pipeline form matters if you write an operation that produces
one — see chapter 08.

### `limit` has two ceilings

```bash
$ curl -s 'localhost:3000/people?limit=200'
{"error":400,"message":"ValidationError","info":{"type":"maximum","path":"query.limit",
 "scope":"…#/components/parameters/limit/schema"}}
```

The parameter's own schema says `maximum: 100`, so 200 is a validation error. And `PersonResource` sets
`queryLimit: 50`, which is a *cap*, applied silently:

```bash
$ curl -s 'localhost:3000/people?limit=60' | jq length
50
$ curl -s 'localhost:3000/people' | jq length            # 68 in the collection
50
```

So `queryLimit` does two jobs: it bounds what a caller can ask for, and it becomes the default page size when
they ask for nothing. Without it, a `GET /people` on a million-document collection tries to return a million
documents. **Set `queryLimit` on every collection-backed resource.**

Note there is no error and no header telling the client its `limit` was reduced — only `Results-Matching`
disagreeing with the array length. Which is another reason to page by following `Link`.

### RQL can also do paging and projection

```bash
$ curl -s -G localhost:3000/people --data-urlencode 'q=limit(2,4)'   # skip 2, take 4
$ curl -s -G localhost:3000/people --data-urlencode 'q=sort(-age)'
$ curl -s -G localhost:3000/people --data-urlencode 'q=select(name)'
```

`limit(skip,count)` — note the argument order, skip first — `sort()` and `select()` set the same job options the
dedicated parameters do. When both are present the precedence is inconsistent, so don't rely on it:

| Both given | Winner |
|---|---|
| `q=sort(-age)` + `sort=age` | the `sort` parameter |
| `q=limit(2,4)` + `limit=3` | the `limit` parameter (but RQL's `skip` of 2 survives) |
| `q=select(name)` + `fields=age` | **RQL's `select`** |

Pick one style and stay with it. The dedicated parameters are self-documenting in the OpenAPI document, so prefer
them and keep `q` for filtering.

## What just happened

Everything in this chapter came out of `getDefaultInfo` on one operation class. The parameters are `$ref`s into
[`components.parameters`](../reference/defaults.md#parameters) of the default document, which is why they are
identical across every resource in your API and why a client can learn them once.

The lifecycle stage doing the work is `prepareQuery` for `q`, `prepareOpts` for everything else. Both are
overridable, which is chapters 08 and 10 — an operation that must always filter by tenant overrides
`prepareQuery` and merges its constraint into whatever the caller asked for.

## Exercises

1. Build a `q` in JavaScript with `encodeURIComponent` on the values and confirm `matches(name,^A)` works.
2. Follow `Link` from `?limit=3&skip=0` to the end. How many requests, and what does the last response's headers
   look like?
3. Set `queryLimit: 2` on `PersonResource` and see which of the two ceilings wins.
4. `q=or(eq(country,GB),eq(country,IT))` versus `q=in(country,GB,IT)` — same results? Turn on `DEBUG=arrest*`
   and compare the Mongo queries.
5. Send `q=aggregate(country)` and convince yourself it returned everything.

---

[← Chapter 04](04-schemas-and-validation.md) · [Tutorial index](README.md) · [Chapter 06 →](06-updating.md)
