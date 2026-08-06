import { API, MongoResource } from 'arrest';
import { getDb } from '../db.js';
import { PersonStatisticsOperation } from '../operations/person-statistics.js';
import { PersonResource } from '../resources/person.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 08 — Custom operations.
 *
 * `GET /people/statistics` joins the generated CRUD set. Two things matter here:
 *
 * 1. **Order.** Express matches in registration order, and `/:id` matches the literal string `statistics`.
 *    The default route table lists `/:id` second and `addOperation` appends, so an operation added *after*
 *    construction is registered after `/:id` and never reached — `GET /people/statistics` would land in
 *    ReadMongoOperation, looking for a person whose id is "statistics". Passing the route table explicitly,
 *    with the specific path spread in before the parametric one, is what makes it work. Object key order is
 *    the route order.
 * 2. **What the subclass doesn't write.** Extending MongoOperation means the collection (`job.coll`), the
 *    error envelope, the operationId-derived scope and the CASL record constraints all come for free; the
 *    subclass only describes itself (`getCustomInfo`) and does the work (`runOperation`).
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

  return api;
}
