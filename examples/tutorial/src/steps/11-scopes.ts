import { API, APIRequest, APIResponse, MongoResource, Scopes } from 'arrest';
import { NextFunction } from 'express';
import { getDb } from '../db.js';
import { PersonStatisticsOperation } from '../operations/person-statistics.js';
import { PersonResource } from '../resources/person.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 11 — Authorization with scopes.
 *
 * Two halves. **Declaring** the scopes is automatic: every operation contributes its operationId
 * (`Person.query`, `Person.statistics`, …) and every resource its name (`Person`), and they end up in the
 * document under the oauth2 security scheme. **Enforcing** them is `initSecurity`'s job: put a Scopes object on
 * `req.scopes` and each operation checks it against its own.
 *
 * The base implementation warns and grants `*` — fine for the tutorial, useless in production. Override it.
 *
 * Read the scope grammar from @vivocha/scopes: `Person` grants every Person operation, `Person.query` grants one,
 * `*` grants everything, and a `-` prefix subtracts — `Person,-Person.remove` is everything but the delete.
 * Anything else (`!Person.remove`, say) parses as a *category* named `!Person`, which grants nothing and denies
 * nothing, so the operation stays allowed. There is no error for a scope nothing understands.
 */
class ScopedAPI extends API {
  /**
   * Stands in for real token validation. `?scope=Person.query,Person.read` in the query string decides what the
   * caller may do, so the chapter can be explored with a browser.
   *
   * A real implementation validates a bearer token and turns its claims into scopes — but the contract is
   * exactly this: set req.scopes, call next. Leave req.scopes unset and every operation answers 401 instead
   * of 403, which is the distinction: 401 is "I don't know who you are", 403 is "I do, and you may not".
   */
  initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction): void {
    const granted = typeof req.query.scope === 'string' ? req.query.scope.split(',').filter((s) => !!s.trim()) : [];
    if (!granted.length) {
      // no ?scope= at all, or nothing but separators: req.scopes stays undefined and the operations answer 401
      return next();
    }
    try {
      req.scopes = new Scopes(granted);
      next();
    } catch (err) {
      // Scopes throws a RangeError on a token it can't parse — an empty one, or anything with an empty half
      // like `Person.` — and an uncaught throw here is a 500. A credential you can't parse is a 401: the
      // caller has to present a different one. Never hand untrusted text to the Scopes constructor bare.
      next(API.newError(401, 'invalid scope'));
    }
  }
}

export async function createApi(): Promise<API> {
  const api = new ScopedAPI({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  // Security schemes have to be on the document before addResource: each operation reads them while attaching
  // to build its own `security` entry. The constructor can't carry them — its argument is merged under `info`.
  api.document.components!.securitySchemes = {
    oauth2: {
      type: 'oauth2',
      flows: {
        clientCredentials: {
          tokenUrl: 'https://example.com/oauth2/token',
          scopes: {}, // filled in by arrest as resources and operations register theirs
        },
      },
    },
  };

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
