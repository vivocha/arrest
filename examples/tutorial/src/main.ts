import { API } from 'arrest';
import { Express } from 'express';
import { Server } from 'node:http';
import { closeDb } from './db.js';

/**
 * Runner for every chapter of the tutorial.
 *
 *   node dist/main.js 03            # run chapter 03 on port 3000
 *   PORT=3001 node dist/main.js 07
 *
 * Each step module exports `createApi(): Promise<API>`, so the runner is the same for all of them.
 */
type Step = { createApi: () => Promise<API>; createServer?: () => Promise<Express> };

const STEPS: { [chapter: string]: () => Promise<Step> } = {
  '01': () => import('./steps/01-first-api.js'),
  '02': () => import('./steps/02-resources-and-operations.js'),
  '03': () => import('./steps/03-mongodb.js'),
  '04': () => import('./steps/04-schemas-and-validation.js'),
  '05': () => import('./steps/05-querying.js'),
  '06': () => import('./steps/06-updating.js'),
  '07': () => import('./steps/07-output-formats.js'),
  '08': () => import('./steps/08-custom-operations.js'),
  '09': () => import('./steps/09-custom-resources.js'),
  '10': () => import('./steps/10-pipeline.js'),
  '11': () => import('./steps/11-scopes.js'),
  '12': () => import('./steps/12-abilities.js'),
  '13': () => import('./steps/13-mcp.js'),
  '14': () => import('./steps/14-production.js'),
};

const chapter = process.argv[2] || '01';
const port = parseInt(process.env.PORT || '3000');

const step = STEPS[chapter];
if (!step) {
  console.error(`Unknown chapter "${chapter}". Available: ${Object.keys(STEPS).join(', ')}`);
  process.exit(1);
}

/**
 * Most chapters just hand back an API and let `listen` build the server. Chapter 14 is about owning the Express
 * app instead, so it exports `createServer` as well — prefer it when it's there.
 */
const mod = await step();
let server: Server;
let prefix = '';

if (mod.createServer) {
  const app = await mod.createServer();
  server = app.listen(port);
  prefix = '/v1'; // API.attach mounts under /v<major>; api.listen does not
} else {
  const api = await mod.createApi();
  server = await api.listen(port);
}

console.log(`chapter ${chapter} listening on http://localhost:${port}${prefix}`);
console.log(`openapi document at http://localhost:${port}${prefix}/openapi.json`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  });
}
