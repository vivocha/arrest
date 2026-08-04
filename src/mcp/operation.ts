import { NextFunction } from 'express';
import { OpenAPIV3, ValidationError } from 'openapi-police';
import { RESTError } from '../error.js';
import { JSONRPC, JSONRPCError, rpc } from '../rpc.js';
import { APIRequest, APIResponse, Method } from '../types.js';
import { MCPResource } from './resource.js';
import {
  MCP_DEFAULT_MAX_OUTPUT_CHARS,
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  MCPErrorCode,
  MCPImplementation,
  MCPProvider,
  MCPTool,
  MCPToolResult,
} from './types.js';

/**
 * A single MCP endpoint, exposing the tools of one bundle.
 *
 * This class implements the MCP protocol and nothing else: the features it serves come from the
 * MCPProvider instances registered for its bundle. Being a regular arrest Operation, it is documented in
 * the OpenAPI spec, it has its own OAuth2 scope and it is protected by the standard security validator,
 * so access to a bundle can be granted independently of access to any other.
 *
 * Transport is stateless Streamable HTTP: every request is a self-contained JSON-RPC call over POST,
 * re-authenticated by the middleware chain, with no server side session to keep or to hijack.
 */
export class MCPOperation extends JSONRPC {
  constructor(public resource: MCPResource, path: string, method: Method = 'post', id?: string) {
    super(resource, path, method, id || 'default');
  }

  /**
   * Identifier of the bundle served by this endpoint.
   */
  get bundleId(): string {
    return this.internalId;
  }
  get serverInfo(): MCPImplementation {
    const bundle = this.resource.getBundle(this.bundleId);
    const info = this.api?.document?.info;
    return (
      this.resource.mcpOptions.serverInfo || {
        name: `${info?.title || 'REST API'}${this.bundleId === 'default' ? '' : ` (${this.bundleId})`}`,
        version: info?.version || '1.0.0',
        ...(bundle.title ? { title: bundle.title } : {}),
      }
    );
  }
  /**
   * MCP mandates 202 Accepted as the response to a notification.
   */
  protected get notificationStatus(): number {
    return 202;
  }

  protected getProviders(): MCPProvider[] {
    return this.resource.getProviders(this.bundleId);
  }

  /**
   * Capabilities are derived from the methods the registered providers actually implement, so that a
   * subclass adding resource or prompt support - by implementing the corresponding JSON-RPC methods and
   * registering providers that serve them - has them advertised without touching this class.
   */
  protected getCapabilities(): any {
    const providers = this.getProviders();
    const out: any = {};
    if (this['tools/list'] && providers.some((p) => p.listTools)) {
      out.tools = { listChanged: false };
    }
    if (this['resources/list'] && providers.some((p) => p.listResources)) {
      out.resources = { listChanged: false, subscribe: false };
    }
    if (this['prompts/list'] && providers.some((p) => p.listPrompts)) {
      out.prompts = { listChanged: false };
    }
    return out;
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    const bundle = this.resource.getBundle(this.bundleId);
    return {
      summary: bundle.title || `MCP endpoint${this.bundleId === 'default' ? '' : ` for the ${this.bundleId} bundle`}`,
      description:
        bundle.description ||
        `Model Context Protocol (MCP) endpoint, speaking JSON-RPC 2.0 over stateless Streamable HTTP. ` +
          `Supported methods: initialize, ping, notifications/initialized, tools/list, tools/call.`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['jsonrpc', 'method'],
              additionalProperties: false,
              properties: {
                jsonrpc: {
                  enum: ['2.0'],
                },
                method: {
                  type: 'string',
                  minLength: 1,
                },
                params: {
                  type: 'object',
                },
                id: {
                  oneOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }],
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'JSON-RPC response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['jsonrpc'],
                additionalProperties: false,
                properties: {
                  jsonrpc: {
                    enum: ['2.0'],
                  },
                  result: {},
                  error: {
                    type: 'object',
                    required: ['code', 'message'],
                    additionalProperties: false,
                    properties: {
                      code: {
                        type: 'integer',
                      },
                      message: {
                        type: 'string',
                        minLength: 1,
                      },
                      data: {},
                    },
                  },
                  id: {
                    oneOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }],
                  },
                },
              },
            },
          },
        },
        '202': {
          description: 'A notification was accepted',
        },
        default: {
          $ref: '#/components/responses/defaultError',
        },
      },
    };
  }

  @rpc
  async initialize(params: any = {}): Promise<any> {
    const requested = params?.protocolVersion;
    return {
      protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSION,
      capabilities: this.getCapabilities(),
      serverInfo: this.serverInfo,
      ...(this.resource.getBundle(this.bundleId).instructions ? { instructions: this.resource.getBundle(this.bundleId).instructions } : {}),
    };
  }

  @rpc
  async ping(): Promise<any> {
    return {};
  }

  @rpc
  async 'notifications/initialized'(): Promise<void> {
    return;
  }

  @rpc
  async 'tools/list'(_params: any, req: APIRequest): Promise<{ tools: MCPTool[] }> {
    const tools: MCPTool[] = [];
    const seen = new Set<string>();
    for (const provider of this.getProviders()) {
      if (!provider.listTools) {
        continue;
      }
      for (const tool of await provider.listTools(req)) {
        if (seen.has(tool.name)) {
          throw new Error(`Duplicate MCP tool name "${tool.name}" in bundle "${this.bundleId}"`);
        }
        seen.add(tool.name);
        tools.push(tool);
      }
    }
    return { tools };
  }

  @rpc
  async 'tools/call'(params: any, req: APIRequest): Promise<MCPToolResult> {
    const name = params?.name;
    if (typeof name !== 'string' || !name.length) {
      throw new JSONRPCError(MCPErrorCode.invalidParams, 'Missing tool name');
    }
    for (const provider of this.getProviders()) {
      if (!provider.listTools || !provider.callTool) {
        continue;
      }
      const tools = await provider.listTools(req);
      if (tools.some((t) => t.name === name)) {
        return this.truncate(await provider.callTool(name, params.arguments, req));
      }
    }
    throw new JSONRPCError(MCPErrorCode.invalidParams, `Unknown tool ${name}`);
  }

  /**
   * Maximum length of a single block of textual content of a tool result. Hosted MCP clients typically
   * offload anything larger to a file, losing the model's ability to reason about it inline, so it's
   * better to truncate explicitly and tell the model how to narrow the request.
   */
  get maxOutputChars(): number {
    return this.resource.getBundle(this.bundleId).maxOutputChars ?? MCP_DEFAULT_MAX_OUTPUT_CHARS;
  }
  /**
   * Enforce maxOutputChars on a tool result. Applied to the result of every provider, including custom
   * ones, so that a bundle's output limit is a property of the endpoint rather than of each provider.
   */
  protected truncate(result: MCPToolResult): MCPToolResult {
    const max = this.maxOutputChars;
    for (const content of result.content) {
      if (content.type === 'text' && content.text.length > max) {
        content.text =
          content.text.substring(0, max) + `\n\n[output truncated at ${max} characters; narrow the request with the limit, fields or q arguments]`;
      }
    }
    return result;
  }

  /**
   * Map a failure to the MCP error model.
   *
   * A request rejected before the JSON-RPC layer - by the security validator, which runs first - is
   * reported as a plain HTTP error, since an MCP client needs to see the 401 or 403 to know it has to
   * authenticate. Everything from the envelope onwards is a JSON-RPC error: a body that does not match the
   * JSON-RPC envelope, which includes a batch request, is an invalid request; anything else, including a
   * failure of a provider, is an internal error.
   */
  protected errorHandler(err: any, req: APIRequest, res: APIResponse, next: NextFunction) {
    if (!this.isRPCRequest(req) || err instanceof JSONRPCError) {
      super.errorHandler(err, req, res, next);
    } else if (err?.name === 'ValidationError') {
      req.logger.warn('mcp invalid request', err);
      super.errorHandler(new JSONRPCError(MCPErrorCode.invalidRequest, 'Invalid request', ValidationError.getInfo(err)), req, res, next);
    } else if (err instanceof RESTError) {
      req.logger.warn('mcp error', err);
      super.errorHandler(new JSONRPCError(MCPErrorCode.internalError, err.message || 'error', err.info), req, res, next);
    } else {
      req.logger.error('mcp internal error', err);
      super.errorHandler(new JSONRPCError(MCPErrorCode.internalError, 'internal error'), req, res, next);
    }
  }
}
