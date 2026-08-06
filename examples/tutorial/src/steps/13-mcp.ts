import { API, MCPResource, MongoResource } from 'arrest';
import { getDb } from '../db.js';
import { PersonStatisticsOperation } from '../operations/person-statistics.js';
import { McpPersonResource } from '../resources/mcp-person.js';
import { TokenResource } from '../resources/token.js';
import { registerPersonSchema } from '../schemas/person.js';
import { seedPeople } from '../seed.js';

/**
 * Chapter 13 — Serving an MCP server.
 *
 * Adding an MCPResource turns operations into tools an AI agent can call. Nothing is exposed unless it opts in:
 * a resource joins the MCP server only via `mcp` in its definition, so a new resource is invisible to agents by
 * default. That default is the point — the failure mode of the opposite default is handing a model the delete
 * endpoint nobody meant to publish.
 *
 * Endpoints, given `bundles: { default: {...}, reporting: {...} }`:
 *   POST /mcp            the default bundle
 *   POST /mcp/reporting  the reporting bundle
 *   GET  /mcp            the catalogue: the bundles this caller can reach (set `catalogue: false` to drop it)
 *
 * Bundles are named, independently scoped groups. A model given a 40-tool list picks badly, so split by
 * audience and grant a token one bundle and not the other — the MCP scopes are `MCP.default`, `MCP.reporting`.
 *
 * Try it (a bare JSON-RPC POST, no client needed — the runner uses api.listen, which mounts at the root, so
 * there is no /v1 prefix here; API.attach is what adds one):
 *   curl -s localhost:3000/mcp -H 'content-type: application/json' \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
 *   curl -s localhost:3000/mcp -H 'content-type: application/json' \
 *     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"person_query","arguments":{"limit":2}}}'
 */

export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });
  const db = await getDb();

  await seedPeople(db);

  registerPersonSchema(api);

  api.addResource(
    new McpPersonResource(db, {
      '/statistics': { get: PersonStatisticsOperation },
      ...MongoResource.defaultRoutes(),
    })
  );

  // Not opted in, and so not visible to any agent — the default this chapter is about.
  api.addResource(new TokenResource());

  api.addResource(
    new MCPResource({
      bundles: {
        default: {
          title: 'People',
          description: 'Look people up and keep their records current',
          instructions: 'Use person_query to find people; ids are 24-character hex strings. Prefer q= filters over fetching everything.',
        },
        reporting: {
          title: 'Reporting',
          description: 'Aggregate statistics over the people collection',
          // A tool result larger than this is truncated with a note telling the model to narrow the request —
          // better than a hosted client silently offloading it to a file the model can't reason about.
          maxOutputChars: 20000,
        },
      },
    })
  );

  return api;
}
