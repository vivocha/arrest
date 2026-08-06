# 07 — Output formats

**Goal:** return the same data as JSON, JSONL or CSV, without writing a serializer — and know where the CSV
support stops.

## The code

None again. `format`, `csv_fields`, `csv_names` and `csv_options` are declared by `QueryMongoOperation` and acted
on by `PipelineOperation`, so [examples/tutorial/src/steps/07-output-formats.ts](../../examples/tutorial/src/steps/07-output-formats.ts)
is chapter 05's server unchanged. This chapter is entirely about the requests.

```bash
node dist/main.js 07
```

## JSONL

```bash
$ curl -si 'localhost:3000/people?format=jsonl&fields=name,country&limit=2'
HTTP/1.1 200 OK
Content-Type: application/jsonl; charset=utf-8

{"name":"Ada Lovelace","country":"GB"}
{"name":"Alan Turing","country":"GB"}
```

One document per line, `\n` between them and **no trailing newline** — which is worth knowing if the consumer
splits on `\n` and rejects an empty last record. Line-delimited JSON is what you want for a pipe into `jq -c`,
a bulk load, or anything that shouldn't hold the whole array in memory. Note that arrest still builds the whole
array in memory before serializing it: JSONL here is a wire format, not streaming.

## CSV

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,country,age&limit=3'
Ada Lovelace,GB,36
Alan Turing,GB,41
Grace Hopper,US,85
```

`csv_fields` is required, and it is what makes CSV possible — a table needs to know its columns, and arrest will
not guess them from the first document. Leave it out and you get **JSON**:

```bash
$ curl -s 'localhost:3000/people?format=csv&limit=1'
[{"_id":"6a743c13…","name":"Ada Lovelace","email":"ada@example.com", …}]      # 200 application/json
```

Silently. There is no error, and `Content-Type` is `application/json`, so a client that asked for CSV and got
this will usually notice only when its parser produces one very strange row. **Send `csv_fields` whenever you
send `format=csv`**, and if callers control the query, reject `format=csv` without `csv_fields` yourself.

The field list is dotted, so `csv_fields=name,tags.0.name` reaches into nested documents. A path that resolves
to nothing is an empty cell, not an error — which also means a typo is silent:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,nope.deep&limit=2&csv_options=header=true'
name,nope.deep
Ada Lovelace,
Alan Turing,
```

And an object-valued column stringifies the way JavaScript stringifies objects:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,tags&limit=1'
Ada Lovelace,[object Object],[object Object]
```

Name a leaf, or use `unwind` below.

### The header row is off unless you send `csv_options`

That first example had no header. This one does:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,country,age&limit=3&csv_options=header=true'
name,country,age
Ada Lovelace,GB,36
Alan Turing,GB,41
Grace Hopper,US,85
```

`csv_options.header` has `default: true` in the parameter's schema, which sounds like "on by default" and isn't.
A JSON Schema `default` fills in a **missing property of an object that exists**; with no `csv_options` at all
there is no object, so nothing gets filled in and `header` is `undefined`. Send *any* option and the default
appears alongside it:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,age&limit=2&csv_options=quotes=true'
"name","age"                     # a header row, because csv_options now exists
"Ada Lovelace","36"
```

So: `csv_options=header=true` when you want one, `csv_options=header=false` to suppress it while setting others.

### `csv_options` has two wire forms

It is declared `style: 'simple', explode: true`, which specifies comma-separated `key=value` pairs in a single
value:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,age&limit=2&csv_options=separator=;,header=false'
Ada Lovelace;36
Alan Turing;41
```

The bracket form also works, because Express's query parser has already turned it into an object before arrest
looks at it:

```bash
$ curl -s -g 'localhost:3000/people?format=csv&csv_fields=name,age&limit=2&csv_options[separator]=;&csv_options[header]=false'
Ada Lovelace;36
Alan Turing;41
```

Both are validated, and the values are coerced — `header=false` arrives as a boolean, not the string `"false"`:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name&limit=1&csv_options=separator=abc'
{"error":400,"message":"ValidationError","info":{"type":"properties","path":"query.csv_options","errors":[
  {"type":"maxLength","path":"query.csv_options/separator", …}]}}
```

An unknown key is accepted and ignored (the schema sets no `additionalProperties`), so `csv_options=headers=true`
— note the `s` — does nothing at all. Spell them from [the table](../reference/defaults.md#csv_options).

### Column names: `csv_names`

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,country&csv_names=Full%20Name,Country&limit=2&csv_options=header=true'
Full Name,Country
Ada Lovelace,GB
Alan Turing,GB
```

`csv_names` renames the columns in the header row. It applies **only if it has exactly as many entries as
`csv_fields`** — otherwise it is ignored, silently, and you get the raw field paths back:

```bash
$ curl -s '…&csv_fields=name,country&csv_names=Full%20Name&csv_options=header=true'
name,country                     # one name for two fields: ignored
```

And since it only affects the header, `csv_names` with no `csv_options` produces nothing visible at all —
there's no header row to rename. `csv_names` is the parameter people report as broken; it needs both a matching
length and a header.

### `unwind`: one row per array element

CSV has no arrays. `unwind` repeats the other columns once per element of the named field:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,tags.name&limit=2&csv_options=unwind=tags,header=true'
name,tags.name
Ada Lovelace,maths
Ada Lovelace,pioneer
Alan Turing,maths
```

Note what happened to the paths: within an unwound row, `tags` is a *single* tag, so the column is `tags.name`.

A document whose array is empty or missing **disappears** — Rita has `tags: []`, so she is not in that output at
all. Prefix the field with `!` to keep her, with the column blank:

```bash
$ curl -s -G localhost:3000/people --data-urlencode 'q=eq(country,IT)' \
    --data-urlencode 'format=csv' --data-urlencode 'csv_fields=name,tags.name' \
    --data-urlencode 'csv_options=unwind=!tags,header=true'
name,tags.name
Federico Faggin,silicon
Rita Levi-Montalcini,
```

One field, top level only. Two arrays means two requests, or a custom operation.

### Escaping is off by default

```bash
$ curl -s '…&csv_fields=name,email'
Smith, "Bob",bob@example.com                  # three columns now. The CSV is corrupt.

$ curl -s '…&csv_fields=name,email&csv_options=quotes=true'
"Smith, \"Bob\"","bob@example.com"
```

Without `quotes=true` nothing is quoted and nothing is escaped, so any value containing the separator, a quote
or a newline breaks the row. **Set `quotes=true` for anything user-supplied.** Note also the escape character:
arrest writes `\"`, not the RFC 4180 `""`. Most spreadsheet importers cope; strict parsers don't. If you need
RFC 4180 exactly, do the conversion yourself with [`toCSV`](../reference/utilities.md#tocsv) or a dedicated
library in a `processResult` override.

### Numbers, dates, and a download name

The seeded people have no fractional numbers and no real `Date` values, so `POST` one first — a `score` of `12.5`
and a `joined` of `new Date(…)` written straight into MongoDB — and then:

```bash
$ curl -s '…&csv_fields=name,score,joined&csv_options=dateFormat=yyyy-LL-dd,timezone=Europe/Rome,decimal=|,separator=;'
name;score;joined
Date Test;12|5;2024-03-01
```

- `decimal` rewrites the decimal point in numbers, for locales where `,` is the separator (in which case set
  `separator` too, or the file is unreadable);
- `dateFormat` is a [luxon](https://moment.github.io/luxon/#/formatting?id=table-of-tokens) pattern, applied in
  `timezone` (default `UTC`). Without it a `Date` becomes ISO 8601. Note this works on real `Date` values — a
  date stored as an ISO *string*, which is what the seeded `created` field is, passes through untouched;
- `eol` sets the line separator — and it is the one option the comma-separated form can't carry. CRLF has to go
  through the bracket form:

  ```bash
  $ curl -s -g '…&csv_options[eol]=%0D%0A' | xxd | head -1
  00000000: 6e61 6d65 0d0a 4164 6120 4c6f 7665 6c61   name..Ada Lovela

  $ curl -s '…&csv_options=eol=%0D%0A' | xxd | head -1
  00000000: 6e61 6d65 0a41 6461 204c 6f76 656c 6163   name.Ada Lovelac    # ignored
  ```

  Express decodes `%0D%0A` before the style parsing runs, so the pair being split is a literal `eol=<CR><LF>`,
  and the regexp that splits key from value uses `.`, which in JavaScript matches neither `\n` nor `\r`. The pair
  doesn't match, so it is dropped without a word. CRLF is what Excel wants, so this matters more often than it
  looks.

```bash
$ curl -si '…&csv_options=filename=people.csv' | grep -i content-disposition
content-disposition: attachment; filename="people.csv"
```

`filename` is what turns the response into a browser download. Without it a browser will happily render the CSV
inline. It works for JSONL too, in principle — but only `csv_options` carries it, so `format=jsonl` plus
`csv_options=filename=x.jsonl` is how you'd have to ask, and that reads like a bug even when it works.

## JSONP

```bash
$ curl -si 'localhost:3000/people?callback=cb&limit=1&fields=name'
HTTP/1.1 200 OK
Content-Type: text/javascript; charset=utf-8

/**/ typeof cb === 'function' && cb([{"name":"Ada Lovelace"}]);
```

`processResult` uses `res.jsonp`, so Express's JSONP support is on for every JSON response in your API. It is
not something arrest declares or documents in the OpenAPI document — it just works, which is the problem: JSONP
is a same-origin-policy bypass by design, and if your API is authenticated by cookie, any page on the internet
can read a response by adding a `<script>` tag.

Express sanitizes the callback name (`callback=alert(1)` becomes `alert1`), so there's no injection, but the
data leak is real. If you don't need it, turn it off:

```ts
api.router();                                       // build the router first
// then, on the Express app you mount it into:
app.set('jsonp callback name', '__no_jsonp__');
```

Use cookies **or** JSONP, never both.

## What just happened

One thing worth naming: all of this lives in
[`PipelineOperation.processResult`](../reference/pipeline.md#processresult), the last step of the pipeline, and
its decision is a three-way switch:

| `job.data` | `feat.format.type` | Response |
|---|---|---|
| falsy | — | `res.end()`, empty body |
| an **array** | `csv` | `toCSV`, `text/csv` |
| an **array** | `jsonl` | one document per line, `application/jsonl` |
| anything else | — | `res.jsonp(job.data)` |

That `array` requirement is why `format` does nothing on `GET /people/{id}`:

```bash
$ curl -si 'localhost:3000/people/6a743c13…?format=jsonl' | grep -i content-type
Content-Type: application/json; charset=utf-8
```

The single-document read isn't an array, so it falls through to JSON — and `ReadMongoOperation` doesn't declare
the `format` parameter anyway. Formats are a collection-level feature.

Everything else survives the format choice: `Results-Matching` and `Link` are still set, `limit` still caps at
`queryLimit`, and abilities still redact — `redactResult` runs *before* `processResult`, so a CSV export cannot
contain a field the caller isn't allowed to see. That ordering is the point of the pipeline, and chapter 10 is
where you start using it yourself.

One consequence of the ordering, though: `csv_fields` names a field in the *redacted* document, and `fields`
narrows what came out of MongoDB. Ask for a column you projected away and it's blank, not an error:

```bash
$ curl -s 'localhost:3000/people?format=csv&csv_fields=name,age&fields=name&csv_options=header=true'
name,age
Ada Lovelace,
```

## Exercises

1. Export every person as CSV with a header, quoted values, CRLF line endings and a filename, and open it in a
   spreadsheet. How many parameters did that take?
2. `format=csv&csv_fields=name,tags.name` with and without `unwind=tags`. Explain both outputs.
3. Follow `Link` with `format=jsonl` and concatenate the pages. Is the result valid JSONL?
4. Add `?callback=x` to a `format=csv` request. Which format wins, and why?
5. Set `queryLimit: 5` on `PersonResource` and try to export the whole collection as CSV. What does that tell you
   about using `format=csv` as an export mechanism? (Chapter 10 builds a real one.)

---

[← Chapter 06](06-updating.md) · [Tutorial index](README.md) · [Chapter 08 →](08-custom-operations.md)
