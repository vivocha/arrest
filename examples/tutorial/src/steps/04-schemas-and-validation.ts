import { API } from 'arrest';
import { getDb } from '../db.js';
import { PersonResource } from '../resources/person.js';
import { registerPersonSchema } from '../schemas/person.js';

/**
 * Chapter 04 — Schemas and validation.
 *
 * Same resource as chapter 03, now with a registered schema behind it. Every write is validated, `readOnly`
 * fields are stripped from bodies, and `GET /schemas/person` serves the schema as it was registered.
 */
export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  registerPersonSchema(api);
  api.addResource(new PersonResource(db));

  return api;
}
