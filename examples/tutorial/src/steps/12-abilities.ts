import { Ability, API, APIRequest, APIResponse, defineAbility, MongoResource } from 'arrest';
import { NextFunction } from 'express';
import { getDb } from '../db.js';
import { PersonStatisticsOperation } from '../operations/person-statistics.js';
import { PersonResource } from '../resources/person.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 12 — Abilities: field and record authorization.
 *
 * Scopes answer one question — may this caller run this operation? CASL abilities answer two more: *which
 * fields* and *which records*. Set `req.ability` instead of (or as well as) `req.scopes` and arrest translates
 * an operation's scopes into CASL terms: the scope's category becomes the subject, its operation becomes the
 * action. `Person.query` is therefore `can('query', 'Person')`.
 *
 * An ability, when present, wins: getAuthorizationError checks it and never looks at req.scopes.
 *
 * Three things the ability controls, all visible in the responses:
 *
 * - **Operations.** No `can(...)` for an action → 403 (401 if neither ability nor scopes are set).
 * - **Fields.** The field list in `can('query', 'Person', [...])` is applied by redactResult. `c.**` style
 *   wildcards work for subtrees.
 * - **Records.** The conditions object becomes a Mongo query merged into `job.query`, so unauthorized records
 *   are not fetched. A single read of a record outside the conditions is a **404, not a 403** — deliberately:
 *   a 403 would confirm the record exists.
 */
class AbilityAPI extends API {
  /**
   * `?role=reader|editor|admin` picks a role, so the effect of each ability is easy to see.
   *
   * Note the `as Ability` assertion: defineAbility returns a PureAbility whose subject/action types are wider
   * than the Ability that APIRequest.ability wants. This is the idiom arrest's own tests use.
   */
  initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction): void {
    const role = typeof req.query.role === 'string' ? req.query.role : 'reader';

    req.ability = defineAbility((can) => {
      if (role === 'admin') {
        can('manage', 'all');
      } else if (role === 'editor') {
        // every Person operation, every field, but only European records
        //
        // Written as a positive condition on purpose. The equivalent-looking
        //     can(['query','read'], 'Person');
        //     cannot(['query','read'], 'Person', { country: { $nin: ['GB','IT','NL'] } });
        // is what CASL documentation would suggest, and it makes every query answer 500: when the only
        // conditional rules for an action are inverted ones, @casl/ability's rulesToQuery returns
        // `{ $and: [...] }`, and arrest's toMongoQuery reads `.$or.length` off it without checking. Prefer
        // positive conditions until that is fixed.
        can(['query', 'read', 'create', 'update', 'patch', 'statistics'], 'Person', { country: { $in: ['GB', 'IT', 'NL'] } });
      } else {
        // read-only, and only these fields: `notes` and `age` never reach the client
        can(['query', 'read'], 'Person', ['_id', 'name', 'email', 'country', 'tags.**']);
      }
    }) as Ability;

    next();
  }
}

export async function createApi(): Promise<API> {
  const api = new AbilityAPI({ title: 'Tutorial API', version: '1.0.0' });
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
