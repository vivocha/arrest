import { API, MongoResource } from 'arrest';
import { getDb } from '../db.js';
import { PersonResource } from '../resources/person.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 06 — Updating.
 *
 * PUT and PATCH come with the resource; this step is where the tutorial exercises them.
 *
 * A second resource shows `escapeProperties`, which percent-escapes `%`, `$` and `.` in document keys on the
 * way in and unescapes them on the way out — the only way to store user-chosen keys, e.g. a settings bag whose
 * keys are hostnames. There is deliberately no schema on it: arbitrary keys are the point.
 */
export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  await seedPeople(db);

  registerPersonSchema(api);
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

  return api;
}
