import { API, MongoResource } from 'arrest';
import { getDb } from '../db.js';

/**
 * Chapter 03 — Persistence with MongoDB.
 *
 * One MongoResource is the whole CRUD set: GET|POST /people and GET|PUT|PATCH|DELETE /people/{id}.
 * No schema yet, so `schema` is still the default `true` and any JSON body is accepted — chapter 04 fixes that.
 */
export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  api.addResource(
    new MongoResource(db, {
      name: 'Person',
      namePlural: 'People',
      description: 'The people known to this API',
      collection: 'people',
    })
  );

  return api;
}
