import { NextFunction } from 'express';
import { OpenAPIV3 } from 'openapi-police';
import { Operation } from '../operation.js';
import { Resource, ResourceDefinition } from '../resource.js';
import { APIRequest, APIResponse, Method } from '../types.js';
import { MCPOperation } from './operation.js';
import { ResourceToolProvider } from './provider.js';
import { MCPBundleDefinition, MCPOptions, MCPProvider } from './types.js';

export const MCP_DEFAULT_BUNDLE = 'default';

/**
 * Installs an MCP server on an API, exposing the operations of the resources that opted in via their
 * `mcp` definition property.
 *
 * Features are grouped into *bundles*. Each bundle is a separate endpoint with its own OAuth2 scope, so a
 * large API can be presented to a model as several small, purposeful tool sets instead of one unusable
 * list, and a token can be granted one bundle and not another:
 *
 * ```
 * POST /mcp            the "default" bundle
 * POST /mcp/sales      the "sales" bundle
 * GET  /mcp            the bundles reachable by the caller
 * ```
 *
 * ```ts
 * api.addResource(new MongoResource(db, { name: 'Order', mcp: true }));
 * api.addResource(new MongoResource(db, {
 *   name: 'Customer',
 *   mcp: { bundles: ['default', 'sales'], operations: ['query', 'read'] },
 * }));
 * api.addResource(new MCPResource({ bundles: { default: {}, sales: { title: 'Sales tools' } } }));
 * ```
 */
export class MCPResource extends Resource {
  readonly mcpOptions: MCPOptions;
  protected bundles: { [id: string]: MCPBundleDefinition };
  protected providers: { [bundleId: string]: MCPProvider[] } = {};
  protected extraProviders: { [bundleId: string]: MCPProvider[] } = {};

  constructor(options: MCPOptions = {}, info: ResourceDefinition = {}) {
    const bundles = options.bundles && Object.keys(options.bundles).length ? options.bundles : { [MCP_DEFAULT_BUNDLE]: {} };
    super({
      name: 'MCP',
      namePlural: 'MCP',
      description: 'Model Context Protocol endpoints, exposing operations of this API as tools for AI agents',
      path: options.path || 'mcp',
      ...info,
    });
    this.mcpOptions = options;
    this.bundles = bundles;

    for (const id of Object.keys(bundles)) {
      // the default bundle sits at the root of the resource, the others at their own sub-path
      this.addOperation(this.createOperation(id, id === MCP_DEFAULT_BUNDLE ? '/' : `/${id}`));
    }
    if (options.catalogue !== false) {
      this.addOperation(this.createCatalogueOperation());
    }
  }

  protected createOperation(bundleId: string, path: string, method: Method = 'post'): Operation {
    return new MCPOperation(this, path, method, bundleId);
  }
  protected createCatalogueOperation(): Operation {
    return new MCPCatalogueOperation(this, '/', 'get');
  }

  get scopeDescription(): string {
    return 'Unrestricted access to all MCP endpoints';
  }

  getBundleIds(): string[] {
    return Object.keys(this.bundles);
  }
  /**
   * The operation serving a bundle, i.e. its endpoint.
   */
  getBundleOperation(id: string): Operation | undefined {
    return this.getOperations().find((op) => op instanceof MCPOperation && op.bundleId === id);
  }
  getBundle(id: string): MCPBundleDefinition {
    return this.bundles[id] || {};
  }

  /**
   * Register an additional provider for a bundle, next to the ones derived from the opted-in resources.
   * This is the extension point for features that don't map to an existing operation.
   */
  addProvider(bundleId: string, provider: MCPProvider): this {
    if (!this.bundles[bundleId]) {
      throw new Error(`Unknown MCP bundle ${bundleId}`);
    }
    if (!this.extraProviders[bundleId]) {
      this.extraProviders[bundleId] = [];
    }
    this.extraProviders[bundleId].push(provider);
    return this;
  }

  /**
   * Providers serving a bundle. Resolved on first use, rather than at attach time, so that resources
   * added to the API after this one are taken into account.
   */
  getProviders(bundleId: string): MCPProvider[] {
    if (!this.providers[bundleId]) {
      this.providers[bundleId] = this.createProviders(bundleId);
    }
    return this.providers[bundleId].concat(this.extraProviders[bundleId] || []);
  }
  protected createProviders(bundleId: string): MCPProvider[] {
    const out: MCPProvider[] = [];
    for (const resource of this.api.getResources()) {
      if (resource !== this && resource.info.mcp) {
        out.push(this.createProvider(resource, bundleId));
      }
    }
    return out;
  }
  protected createProvider(resource: Resource, bundleId: string): MCPProvider {
    return new ResourceToolProvider(resource, bundleId, this.getBundle(bundleId));
  }
}

/**
 * Lists the MCP bundles the caller can access, with the tools each one exposes. Useful for discovery
 * when an API offers several bundles, and to check what a given token is actually allowed to do.
 *
 * Bundles whose endpoint the caller could not reach are left out, so the catalogue never advertises an
 * endpoint that would answer 403.
 */
export class MCPCatalogueOperation extends Operation {
  constructor(public resource: MCPResource, path: string, method: Method) {
    super(resource, path, method, 'catalogue');
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'List the MCP bundles available to the caller',
      responses: {
        '200': {
          description: 'The available MCP bundles',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'url', 'tools'],
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    url: { type: 'string' },
                    tools: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
        default: {
          $ref: '#/components/responses/defaultError',
        },
      },
    };
  }

  async handler(req: APIRequest, res: APIResponse, next?: NextFunction) {
    try {
      // req.baseUrl already includes the resource base path, as this router is mounted on it
      const base = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['host']}${req.baseUrl}`;
      const out: any[] = [];
      for (const id of this.resource.getBundleIds()) {
        const endpoint = this.resource.getBundleOperation(id);
        if (endpoint && !endpoint.isAuthorized(req)) {
          continue;
        }
        const bundle = this.resource.getBundle(id);
        const tools: string[] = [];
        for (const provider of this.resource.getProviders(id)) {
          if (provider.listTools) {
            tools.push(...(await provider.listTools(req)).map((t) => t.name));
          }
        }
        out.push({
          id,
          ...(bundle.title ? { title: bundle.title } : {}),
          ...(bundle.description ? { description: bundle.description } : {}),
          url: id === MCP_DEFAULT_BUNDLE ? base : `${base}/${id}`,
          tools,
        });
      }
      res.json(out);
    } catch (err) {
      this.api.handleError(err, req, res, next);
    }
  }
}
