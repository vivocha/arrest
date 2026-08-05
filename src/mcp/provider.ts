import { getLogger } from 'debuggo';
import { OpenAPIV3 } from 'openapi-police';
import { Operation } from '../operation.js';
import { Resource } from '../resource.js';
import { APIRequest } from '../types.js';
import { dispatchInternal, InternalResponse } from './dispatch.js';
import { annotationsFor, MCP_BODY_ARGUMENT, operationParameters, operationToInputSchema, operationToOutputSchema, toolNameFor } from './schema.js';
import { MCPBundleDefinition, MCPProvider, MCPResourceOptions, MCPTool, MCPToolInfo, MCPToolResult } from './types.js';

const logger = getLogger('arrest');

const pathParamRegExp = /\/:([^#?/]+)/g;

/**
 * Whether a provider serves the named tool, using its own `hasTool` when it implements one and falling
 * back to a lookup in its tool list. This is how ownership of a tool must be decided: a provider whose
 * tool list is expensive to build - because it is derived from data, or from resources created per
 * request - can then answer a single call without materializing everything it could offer.
 */
export async function providerHasTool(provider: MCPProvider, name: string, req: APIRequest): Promise<boolean> {
  if (provider.hasTool) {
    return provider.hasTool(name, req);
  } else if (provider.listTools) {
    return (await provider.listTools(req)).some((t) => t.name === name);
  } else {
    return false;
  }
}

export interface MCPToolBinding {
  tool: MCPTool;
  operation: Operation;
  /**
   * Parameters of the underlying operation, keyed by name, used to route each tool argument to the
   * path, the query string or a header.
   */
  parameters: { [name: string]: OpenAPIV3.ParameterObject };
}

export interface ResourceToolProviderOptions extends MCPResourceOptions {
  /**
   * Replaces the resource name in the generated tool names, which become `<toolNamePrefix>_<internalId>`.
   * Useful when several providers expose resources that share a name - one per tenant, or one per
   * dynamically created data model - and their tools have to stay distinct within a bundle.
   */
  toolNamePrefix?: string;
}

/**
 * Exposes the operations of a Resource as MCP tools.
 *
 * Tool descriptors are derived from the OpenAPI definition of each operation and can be customized, in
 * increasing order of precedence, by the resource's `mcp.tools` entry and by the operation's `mcpTool`
 * getter. Calls are performed by re-dispatching an authenticated request through the API router, so an
 * MCP call is subject to exactly the same validation and authorization as the equivalent REST call.
 */
export class ResourceToolProvider implements MCPProvider {
  /**
   * @param options overrides the resource's own `mcp` definition. Meant for resources that aren't part of
   * the API document - built per request, for instance - whose MCP configuration therefore cannot come
   * from a static ResourceDefinition.
   */
  constructor(
    public resource: Resource,
    public bundleId: string,
    public bundle: MCPBundleDefinition = {},
    protected providerOptions?: ResourceToolProviderOptions
  ) {}

  protected get options(): ResourceToolProviderOptions {
    if (this.providerOptions) {
      return this.providerOptions;
    }
    const mcp = this.resource.info.mcp;
    // `mcp: true` is the shorthand for "every operation, default bundle", i.e. no options at all
    return typeof mcp === 'object' ? mcp : {};
  }

  /**
   * Whether the resource, and this specific operation, opted into this bundle.
   */
  protected isSelected(op: Operation): boolean {
    const { bundles = ['default'], operations, tools = {} } = this.options;
    if (operations && !operations.includes(op.internalId)) {
      return false;
    }
    const resourceInfo = tools[op.internalId];
    const operationInfo = op.mcpTool;
    if (resourceInfo === false || operationInfo === false) {
      return false;
    }
    const scoped = operationInfo?.bundles || resourceInfo?.bundles || bundles;
    return scoped.includes(this.bundleId);
  }

  /**
   * The MCP descriptor of an operation, merging generated defaults with the resource-level and
   * operation-level customizations.
   */
  protected getToolInfo(op: Operation): MCPToolInfo {
    const { tools = {} } = this.options;
    // isSelected has already excluded both `false` values, and spreading `false` or `undefined` is a no-op
    return {
      ...(tools[op.internalId] as MCPToolInfo),
      ...(op.mcpTool as MCPToolInfo),
    };
  }

  /**
   * The name of the tool exposing an operation. Kept separate from createBinding so that ownership of a
   * tool can be settled without generating its schema.
   */
  protected toolNameOf(op: Operation, info: MCPToolInfo): string {
    return info.name || toolNameFor(this.options.toolNamePrefix || `${this.resource.info.name}`, op.internalId);
  }

  protected createBinding(op: Operation, info: MCPToolInfo): MCPToolBinding {
    const doc = this.resource.api?.getOriginalDocument();
    // the operation info stored in the unresolved document is the one safe to serialize
    const opInfo: OpenAPIV3.OperationObject =
      (doc?.paths?.[this.swaggerPathOf(op)]?.[op.method] as OpenAPIV3.OperationObject) || (op.info as OpenAPIV3.OperationObject);
    const parameters = operationParameters(opInfo, doc).reduce((o, p) => {
      o[p.name] = p;
      return o;
    }, {} as { [name: string]: OpenAPIV3.ParameterObject });

    const tool: MCPTool = {
      name: this.toolNameOf(op, info),
      description: info.description || opInfo.summary || opInfo.description || `Execute ${opInfo.operationId}`,
      inputSchema: info.inputSchema || operationToInputSchema(opInfo, doc, info.omitParameters),
      annotations: { ...annotationsFor(op.method), ...info.annotations },
    };
    const outputSchema = typeof info.outputSchema === 'undefined' ? operationToOutputSchema(opInfo, doc) : info.outputSchema;
    if (outputSchema) {
      tool.outputSchema = outputSchema;
    }
    if (info.annotations?.title) {
      tool.title = info.annotations.title;
    }
    return { tool, operation: op, parameters };
  }

  protected swaggerPathOf(op: Operation): string {
    return op.documentPath;
  }

  /**
   * Bindings for every operation of the resource visible to the caller of `req`.
   *
   * Operations the caller is not authorized to perform are left out, so that a model is never told about a
   * tool whose invocation is bound to fail with a 403, and no information about the shape of the API leaks
   * to a caller that cannot use it. Authorization is decided by the operation itself, with the very same
   * logic its security validator applies.
   */
  getBindings(req: APIRequest): MCPToolBinding[] {
    const out: MCPToolBinding[] = [];
    for (const op of this.resource.getOperations()) {
      if (this.isSelected(op) && op.isAuthorized(req)) {
        out.push(this.createBinding(op, this.getToolInfo(op)));
      }
    }
    return out;
  }

  async listTools(req: APIRequest): Promise<MCPTool[]> {
    return this.getBindings(req).map((b) => b.tool);
  }

  /**
   * Whether the caller of `req` can reach the named tool on this resource. Decided with the same
   * selection and authorization filter as listTools, but without building any schema.
   */
  async hasTool(name: string, req: APIRequest): Promise<boolean> {
    for (const op of this.resource.getOperations()) {
      if (this.isSelected(op) && op.isAuthorized(req) && this.toolNameOf(op, this.getToolInfo(op)) === name) {
        return true;
      }
    }
    return false;
  }

  async callTool(name: string, args: any, req: APIRequest): Promise<MCPToolResult> {
    const binding = this.getBindings(req).find((b) => b.tool.name === name);
    if (!binding) {
      throw new Error(`Unknown tool ${name}`);
    }
    return this.invoke(binding, args || {}, req);
  }

  /**
   * Split the tool arguments into path parameters, query string and body, then perform the operation.
   *
   * Argument values are passed through uncoerced: the operation's own ParameterObject validators are the
   * single source of truth for coercion and validation, and a tool call must not be able to bypass or
   * anticipate them.
   */
  protected async invoke(binding: MCPToolBinding, args: any, req: APIRequest): Promise<MCPToolResult> {
    const { operation, parameters } = binding;
    const params: { [name: string]: any } = {};
    const query: { [name: string]: any } = {};
    const headers: { [name: string]: string } = {};
    let body: any = undefined;

    for (const [key, value] of Object.entries(args)) {
      const parameter = parameters[key];
      if (key === MCP_BODY_ARGUMENT && !parameter) {
        body = value;
      } else if (!parameter) {
        // unknown argument: hand it to the query string, so that the operation's own validators decide
        query[key] = value;
      } else if (parameter.in === 'path') {
        params[key] = value;
      } else if (parameter.in === 'header') {
        headers[key.toLowerCase()] = '' + value;
      } else {
        query[key] = value;
      }
    }

    let path = this.resource.basePath + operation.path;
    path = path.replace(pathParamRegExp, (_match, name) => `/${encodeURIComponent(params[name] ?? '')}`);
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        value.forEach((v) => search.append(key, '' + v));
      } else if (value !== null && typeof value === 'object') {
        Object.entries(value).forEach(([k, v]) => search.append(`${key}[${k}]`, '' + v));
      } else if (typeof value !== 'undefined') {
        search.append(key, '' + value);
      }
    }
    const url = search.toString().length ? `${path}?${search.toString()}` : path;

    logger.debug('mcp tool call', binding.tool.name, operation.method, url);
    const response = await dispatchInternal(this.resource.api, req, {
      method: operation.method,
      url,
      params,
      query,
      body,
      headers: Object.keys(headers).length ? headers : undefined,
    });
    return this.toToolResult(binding, response);
  }

  /**
   * Map an HTTP response to an MCP tool result.
   *
   * An unsuccessful response is reported as a tool result with `isError` set, carrying the API's own
   * error body, rather than as a JSON-RPC error: the model can then read the reason - insufficient
   * privileges, a validation failure, a missing resource - and correct course.
   */
  protected toToolResult(binding: MCPToolBinding, response: InternalResponse): MCPToolResult {
    const isError = response.status < 200 || response.status >= 300;
    const out: MCPToolResult = { content: [] };
    const payload = typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2);
    out.content.push({ type: 'text', text: isError ? `The operation failed with status ${response.status}: ${payload}` : payload });

    if (isError) {
      out.isError = true;
    } else {
      const meta = this.getResultMetadata(response);
      if (meta) {
        out.content.push({ type: 'text', text: meta });
      }
      if (binding.tool.outputSchema && response.body && typeof response.body === 'object' && !Array.isArray(response.body)) {
        out.structuredContent = response.body;
      }
    }
    return out;
  }

  /**
   * Surface the pagination metadata arrest returns in headers, which a model would otherwise not see.
   */
  protected getResultMetadata(response: InternalResponse): string | undefined {
    const matching = response.headers['results-matching'];
    const skipped = response.headers['results-skipped'];
    if (typeof matching === 'undefined') {
      return undefined;
    }
    const parts = [`${matching} items match the query`];
    if (typeof skipped !== 'undefined') {
      parts.push(`${skipped} skipped`);
    }
    if (response.headers['link']) {
      parts.push('more items are available: repeat the call increasing skip');
    }
    return parts.join(', ');
  }
}

/**
 * Serves the tools of providers that only exist per request.
 *
 * Resources created dynamically - one per tenant, per data model, per plugin - are not part of the API's
 * resource list, so MCPResource cannot discover them: only the request says which of them exist and which
 * of them the caller can see. A subclass implements `getProviders`, typically returning a
 * ResourceToolProvider per resource it built for this request, and this class takes care of aggregating
 * them and routing calls.
 *
 * `findProvider` is the seam that keeps a call cheap: the default implementation asks every provider
 * whether it owns the tool, but a subclass that can tell from the tool name alone - by giving each
 * provider a `toolNamePrefix` - should override it and build that one provider only.
 */
export abstract class DynamicToolProvider implements MCPProvider {
  /**
   * Providers already resolved for a request, so that the hasTool/callTool pair a single tool call
   * performs resolves - and therefore builds - each provider once. Keyed by the request object, which the
   * garbage collector disposes of at the end of the request, so nothing is kept between requests: a
   * dynamic provider's whole point is that its providers are only valid for one caller.
   */
  private resolved: WeakMap<APIRequest, Map<string, MCPProvider | undefined>> = new WeakMap();

  /**
   * The providers reachable by the caller of `req`. Called once per `tools/list`, so an implementation
   * that builds resources should cache whatever is expensive.
   */
  protected abstract getProviders(req: APIRequest): Promise<MCPProvider[]>;

  /**
   * The provider serving the named tool, or undefined if none does. Called at most once per tool name per
   * request, so an override is free to do real work - building the one resource that serves the tool, for
   * instance - rather than filtering an already available list.
   */
  protected async findProvider(name: string, req: APIRequest): Promise<MCPProvider | undefined> {
    for (const provider of await this.getProviders(req)) {
      if (provider.callTool && (await providerHasTool(provider, name, req))) {
        return provider;
      }
    }
    return undefined;
  }

  private async resolveProvider(name: string, req: APIRequest): Promise<MCPProvider | undefined> {
    let byName = this.resolved.get(req);
    if (!byName) {
      byName = new Map();
      this.resolved.set(req, byName);
    }
    if (!byName.has(name)) {
      byName.set(name, await this.findProvider(name, req));
    }
    return byName.get(name);
  }

  async listTools(req: APIRequest): Promise<MCPTool[]> {
    const out: MCPTool[] = [];
    for (const provider of await this.getProviders(req)) {
      if (provider.listTools) {
        out.push(...(await provider.listTools(req)));
      }
    }
    return out;
  }

  async hasTool(name: string, req: APIRequest): Promise<boolean> {
    return !!(await this.resolveProvider(name, req));
  }

  async callTool(name: string, args: any, req: APIRequest): Promise<MCPToolResult> {
    const provider = await this.resolveProvider(name, req);
    if (!provider?.callTool) {
      throw new Error(`Unknown tool ${name}`);
    }
    return provider.callTool(name, args, req);
  }
}
