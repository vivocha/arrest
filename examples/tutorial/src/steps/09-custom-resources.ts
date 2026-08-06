import { API, MongoResource } from 'arrest';
import { getDb } from '../db.js';
import { PersonStatisticsOperation } from '../operations/person-statistics.js';
import { PersonResource } from '../resources/person.js';
import { TokenResource } from '../resources/token.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 09 — Custom resources.
 *
 * TokenResource extends Resource, not MongoResource: no collection, no generated CRUD, just two hand-written
 * operations sharing a tag, a base path and a scope. This is the common case in real projects — logins,
 * callbacks, probes, /me — and it is a first-class path, not a workaround.
 *
 * Note the base path arrest derives: `namePlural` "Tokens" is decamelized into `/tokens`. A multi-word name
 * like `AccessToken`/`AccessTokens` would give `/access-tokens`; pass `path` in the definition to override.
 */
export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  await seedPeople(db);

  registerPersonSchema(api);

  api.addResource(
    new PersonResource(db, {
      '/statistics': { get: PersonStatisticsOperation },
      ...MongoResource.defaultRoutes(),
    })
  );
  api.addResource(new TokenResource());

  return api;
}
