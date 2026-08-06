# 00 — Setting up

## What you need

- **Node.js ≥ 20**
- **MongoDB 7 or later** on `localhost:27017`, from chapter 03 onwards. Docker is the quickest way:
  ```bash
  docker run -d --name arrest-tutorial-mongo -p 27017:27017 mongo:7
  ```
- **pnpm**, because the example is a workspace package of the arrest repository.

Chapters 01 and 02 need no database at all, so you can start reading before you start Docker.

## Running the example

The example app is [examples/tutorial/](../../examples/tutorial/) in the arrest repository. Clone the repo,
install once at the root, build the example, and run a chapter by number:

```bash
git clone https://github.com/vivocha/arrest.git
cd arrest
pnpm install
pnpm run build                      # arrest itself

cd examples/tutorial
pnpm run build                      # the example app
node dist/main.js 01                # chapter 01, on port 3000
PORT=3001 node dist/main.js 05      # chapter 05, on port 3001
```

Every chapter serves its document at `/openapi.json`, and it is worth keeping open in a browser tab: much of
what you will do over the next chapters is add things to a definition and then look at what appeared in the
document.

## Following along in your own project

Nothing in the tutorial depends on being inside the arrest repository. To build along in a project of your own:

```bash
mkdir my-api && cd my-api
npm init -y
npm install arrest express mongodb
npm install --save-dev typescript @types/node @types/express
```

Then set `"type": "module"` in `package.json` and use this `tsconfig.json`, which is the example's own:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "strictNullChecks": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

`NodeNext` and `experimentalDecorators` are not negotiable — see
[Installation](../guide/02-installation.md#typescript-configuration) for why. The practical consequence of
`NodeNext` is that your own relative imports carry a `.js` extension even though the files are `.ts`:

```ts
import { PersonResource } from './resources/person.js';
```

## How the example is laid out

```
examples/tutorial/
  src/
    main.ts            the runner: picks a chapter, starts a server, handles SIGINT
    db.ts              one shared MongoClient
    seed.ts            eight people, inserted if the collection is empty
    schemas/person.ts  the person JSON schema             (from chapter 04)
    resources/         resources shared between chapters  (from chapter 04)
    operations/        custom operations                  (from chapter 08)
    steps/NN-*.ts      one entry point per chapter, each exporting createApi()
```

Each step module exports the same thing:

```ts
export async function createApi(): Promise<API> { /* ... */ }
```

and [main.ts](../../examples/tutorial/src/main.ts) calls `api.listen(port)` on the result. That is the entire
runner, and it is why every chapter is a complete, runnable server rather than a snippet.

The shared files matter to how the tutorial reads. When chapter 08 adds `GET /people/statistics`, it does not
copy the resource — it imports the same [PersonResource](../../examples/tutorial/src/resources/person.ts) that
chapter 04 introduced and passes it a different route table. So a change to a shared file is visible to every
later chapter, exactly as it would be in your own codebase.

## The database

[db.ts](../../examples/tutorial/src/db.ts) opens one `MongoClient` for the process and hands out its `Db`:

```ts
export async function getDb(): Promise<Db> {
  if (!client) {
    client = await MongoClient.connect(MONGO_URL);
  }
  return client.db();
}
```

Set `MONGO_URL` to point somewhere else; the default is `mongodb://localhost:27017/arrest-tutorial`.

`MongoResource` also accepts a connection string instead of a `Db`, and connects for you. The example passes a
`Db` deliberately: a string means one client per resource, which for a service with a dozen collection-backed
resources is a dozen connection pools to the same server.

To start over at any point:

```bash
mongosh arrest-tutorial --eval 'db.dropDatabase()'
```

The seed runs on every boot but does nothing when the collection is non-empty, so dropping the database and
restarting a chapter gets you back to the eight original people.

## Ready

```bash
node dist/main.js 01
curl localhost:3000/greetings
```

If that prints `{"message":"Hello from arrest"}`, everything is in place.

---

[Tutorial index](README.md) · [Manual index](../README.md) · [Chapter 01 →](01-first-api.md)
