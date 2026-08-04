import { getLogger } from 'debuggo';
import { OpenAPIV3 } from 'openapi-police';
import { Operation } from '../operation.js';
import { Resource } from '../resource.js';
import { APIRequest } from '../types.js';
import { dispatchInternal, InternalResponse } from './dispatch.js';
import { annotationsFor, MCP_BODY_ARGUMENT, operationParameters, operationToInputSchema, operationToOutputSchema, toolNameFor } from './schema.js';
import { MCPBundleDefinition, MCPProvider, MCPTool, MCPToolInfo, MCPToolResult } from './types.js';

const logger = getLogger('arrest');

const pathParamRegExp = /\/:([^#?/]+)/g;

export interface MCPToolBinding {
  tool: MCPTool;
  operation: Operation;
  /**
   * Parameters of the underlying operation, keyed by name, used to route each tool argument to the
   * path, the query string or a header.
   */
  parameters: { [name: string]: OpenAPIV3.ParameterObject };
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
  constructor(public resource: Resource, public bundleId: string, public bundle: MCPBundleDefinition = {}) {}

  protected get options(): { bundles?: string[]; operations?: string[]; tools?: { [id: string]: MCPToolInfo | false } } {
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
      name: info.name || toolNameFor('' + this.resource.info.name, op.internalId),
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
    let path = this.resource.basePath + op.swaggerPath;
    if (path.length > 1 && path[path.length - 1] === '/') {
      path = path.substring(0, path.length - 1);
    }
    return path;
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
