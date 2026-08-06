import { Ability, API, APIRequest, APIResponse, defineAbility, JSONRPC, MCPResource, Method, MongoResource, Resource, RESTError, rpc } from 'arrest';
import express, { NextFunction } from 'express';
import { Db } from 'mongodb';
import { getDb } from '../db.js';
import { PersonStatisticsOperation } from '../operations/person-statistics.js';
import { McpPersonResource } from '../resources/mcp-person.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 14 — Production shape.
 *
 * Everything the earlier chapters did one at a time, assembled the way a real service does it:
 *
 * - `extends API`, so security, logging and shared middleware live in one place;
 * - a JSON-RPC endpoint, for the calls that don't fit REST;
 * - `attach` into an existing Express app rather than `listen`, because a real deployment has a health probe,
 *   a metrics endpoint and its own error page.
 */

/** A JSON-RPC endpoint. Methods marked `@rpc` are callable; anything else on the class is not. */
class MaintenanceRPC extends JSONRPC {
  constructor(
    protected db: Db,
    resource: Resource,
    path: string,
    method: Method
  ) {
    super(resource, path, method, 'rpc');
  }

  /**
   * `{"jsonrpc":"2.0","id":1,"method":"countPeople","params":{"country":"IT"}}`
   *
   * The decorator is the whole opt-in: dispatch refuses any method without `.rpc` set, with a -32601, so a
   * helper method on this class can't be reached from outside.
   */
  @rpc
  async countPeople(params: { country?: string } = {}): Promise<number> {
    return this.db.collection('people').countDocuments(params.country ? { country: params.country } : {});
  }

  /** Not decorated: calling "reindex" gets -32601 Unknown method. */
  async reindex(): Promise<void> {
    /* deliberately unreachable */
  }
}

class MaintenanceResource extends Resource {
  constructor(db: Db) {
    super({ name: 'Maintenance', namePlural: 'Maintenance', description: 'Operational RPCs' });
    this.addOperation(new MaintenanceRPC(db, this, '/', 'post'));
  }
}

class TutorialAPI extends API {
  /**
   * The one place authorization is decided. In production this validates a bearer token; here it reads two
   * headers so the chapter can be exercised with curl.
   *
   * Middleware that has to run *before* the operations — tenant resolution, request tagging — belongs here
   * too: initSecurity is registered first in the router, ahead of every resource.
   */
  initSecurity(req: APIRequest, _res: APIResponse, next: NextFunction): void {
    const tenant = req.headers['x-tenant'];
    if (typeof tenant === 'string') {
      // a multi-tenant service typically stashes this and has its operations constrain every query by it
      (req as any).tenant = tenant;
    }

    req.ability = defineAbility((can) => {
      if (req.headers['x-admin']) {
        can('manage', 'all');
      } else {
        can(['query', 'read', 'statistics'], 'Person', ['_id', 'name', 'country', 'tags.**']);
        // The MCP scopes. Each bundle is an operation of the MCP resource — `default` is granted, `reporting`
        // is not — and the catalogue is one too, so GET /mcp needs `catalogue` to be granted separately.
        can(['default', 'catalogue'], 'MCP');
        // Operations of the JSON-RPC resource are authorized like any other: the scope is Maintenance.rpc, so
        // in CASL terms the action is `rpc` on subject `Maintenance`. Omit this and every call is a 403 —
        // before the JSON-RPC envelope is even parsed, which is why the reply is a plain HTTP error rather
        // than a JSON-RPC one.
        can('rpc', 'Maintenance');
      }
    }) as Ability;

    next();
  }
}

export async function createApi(): Promise<API> {
  const api = new TutorialAPI({ title: 'Tutorial API', version: '1.0.0', description: 'The API the tutorial built' });
  const db = await getDb();

  await seedPeople(db);

  registerPersonSchema(api);
  api.addResource(
    new McpPersonResource(db, {
      '/statistics': { get: PersonStatisticsOperation },
      ...MongoResource.defaultRoutes(),
    })
  );
  api.addResource(new MaintenanceResource(db));

  // The ability above grants `default` on MCP but not `reporting`, so the reporting bundle is absent from this
  // caller's catalogue and its tools never appear in tools/list.
  api.addResource(new MCPResource({ bundles: { default: {}, reporting: {} } }));

  return api;
}

/**
 * What `main.ts` does for the other chapters, done by hand — because this is the chapter about doing it by hand.
 *
 * `attach` mounts the API under `/v<major>` — here `/v1`, from the 1.0.0 version — on an app you own, so the
 * probe below is a sibling of the API rather than something wedged inside it. `listen` does *not* add that
 * prefix, which is the practical difference between the two.
 *
 * The `servers` entry of the served document follows: `GET /v1/openapi.json` reports
 * `[{ url: 'http://host/v1' }]`, built from the request, so a client generated from it targets the right base
 * path without configuration.
 */
export async function createServer(): Promise<express.Express> {
  const app = express();
  const api = await createApi();

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  await api.attach(app as unknown as express.Router);

  /**
   * The catch-all. `API.handle404Error` is the natural choice — it sends arrest's JSON error envelope — but it
   * logs through `req.logger`, which is installed by the API's own router. Mounted *outside* that router, as it
   * is here, `req.logger` is undefined and the handler throws, turning a 404 into an Express HTML 500. So do
   * the same thing without the logger:
   */
  app.use((_req, res) => {
    RESTError.send(res, 404, 'Not Found', 'the requested resource cannot be found, check the endpoint URL');
  });

  return app;
}
