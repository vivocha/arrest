import { API, Resource } from 'arrest';
import { Db } from 'mongodb';
import { getDb } from '../db.js';
import { PeopleExportOperation } from '../operations/people-export.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 10 — The pipeline.
 *
 * PeopleExportOperation needs a Db, so it can't go in a route table: the entries there are called as
 * `new Factory(resource, path, method)` and there is nowhere to pass anything else. The way round it is to
 * construct the operation yourself and hand it over with the single-argument `addOperation` — which is why that
 * overload exists.
 */
class ReportResource extends Resource {
  constructor(db: Db) {
    super({ name: 'Report', namePlural: 'Reports', description: 'Bulk exports' });
    this.addOperation(new PeopleExportOperation(db, this, '/people', 'get'));
  }
}

export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  await seedPeople(db);

  // the export's 200 response refs #/components/schemas/person, so the schema has to be registered
  registerPersonSchema(api);
  api.addResource(new ReportResource(db));

  return api;
}
