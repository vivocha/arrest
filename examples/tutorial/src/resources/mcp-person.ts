import { MongoRoutes } from 'arrest';
import { Db } from 'mongodb';
import { PersonResource } from './person.js';

/**
 * PersonResource, opted into the MCP server.
 *
 * A subclass rather than an edit to PersonResource, so the resource the earlier chapters use stays MCP-free —
 * `mcp` in the definition is the only opt-in, and a resource without it is invisible to every agent.
 *
 * Everything below except `bundles` is optional: with no `tools` entry at all, each operation becomes a tool
 * whose name, description and input schema are derived from its OpenAPI definition.
 */
export class McpPersonResource extends PersonResource {
  constructor(db: Db, routes?: MongoRoutes) {
    super(db, routes);
    this.info.mcp = {
      // The bundles this resource takes part in. A tool with no `bundles` of its own appears in *all* of them —
      // which is why person_create shows up in the reporting bundle too. Per-tool `bundles` narrows it.
      bundles: ['default', 'reporting'],
      // Whitelist by Operation.internalId. Absent = every operation is a candidate; naming them means a
      // future operation isn't published by accident. `remove` is deliberately left out, so there is no tool
      // a model could call to delete a person.
      operations: ['query', 'read', 'create', 'update', 'patch', 'statistics'],
      tools: {
        query: {
          // The single most important field for tool-selection accuracy — be explicit and give examples.
          description:
            'Search people. `q` takes an RQL filter, e.g. q=eq(country,IT) or q=and(gt(age,40),eq(country,GB)). ' +
            'Returns at most 50 records; use skip to page.',
          // Machine-facing parameters a model has no business setting.
          omitParameters: ['format', 'csv_fields', 'csv_names', 'csv_options'],
          bundles: ['default'],
        },
        statistics: { bundles: ['reporting'] },
        // `patch` works over MCP: PatchMongoOperation declares its body as application/json, and a tool's
        // request body arrives as the `body` argument. A hand-written operation using the
        // application/json-patch+json media type would *not* — the MCP layer doesn't read that content type.
        // Set an entry to false to hide an operation even though the resource opted in:
        //   update: false,
      },
    };
  }
}
