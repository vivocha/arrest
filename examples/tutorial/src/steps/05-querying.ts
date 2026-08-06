import { API } from 'arrest';
import { getDb } from '../db.js';
import { PersonResource } from '../resources/person.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 05 — Querying.
 *
 * Nothing new in the code: the query parameters (q, limit, skip, fields, sort) come with
 * QueryMongoOperation. This step only seeds the collection so there is something to query, and sets
 * `queryLimit: 50` via PersonResource so the effect of a cap is visible.
 */
export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  await seedPeople(db);

  registerPersonSchema(api);
  api.addResource(new PersonResource(db));

  return api;
}
