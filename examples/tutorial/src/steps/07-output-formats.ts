import { API } from 'arrest';
import { getDb } from '../db.js';
import { PersonResource } from '../resources/person.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 07 — Output formats.
 *
 * Again no new code: `format=json|jsonl|csv` and the csv_* parameters are declared by QueryMongoOperation and
 * handled by PipelineOperation.processResult. The chapter is about the requests, not the server.
 */
export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  await seedPeople(db);

  registerPersonSchema(api);
  api.addResource(new PersonResource(db));

  return api;
}
