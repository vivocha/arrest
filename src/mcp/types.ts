import { APIRequest } from '../types.js';

/**
 * Version of the MCP specification implemented by this module. Clients requesting a different
 * version are answered with this one, as allowed by the spec (they may then disconnect).
 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
/**
 * Protocol versions this implementation is compatible with, most recent first.
 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'];
/**
 * Default maximum size of the textual payload of a tool result. Hosted MCP clients typically offload
 * anything larger to a file, losing the model's ability to reason about it inline, so it's better to
 * truncate explicitly and tell the model how to narrow the request.
 */
export const MCP_DEFAULT_MAX_OUTPUT_CHARS = 100000;

/**
 * JSON-RPC error codes used by the MCP layer. -32601 and -32600 are standard JSON-RPC, the others are
 * the conventional MCP mapping.
 */
export enum MCPErrorCode {
  parseError = -32700,
  invalidRequest = -32600,
  methodNotFound = -32601,
  invalidParams = -32602,
  internalError = -32603,
}

/**
 * Customization of the MCP tool derived from an Operation. Every field is optional: by default the tool
 * name, description and input schema are derived from the operation's OpenAPI definition.
 */
export interface MCPToolInfo {
  /**
   * Tool name as seen by the model. Defaults to a sanitized form of the resource name and the operation
   * id (e.g. `orders_query`). Must match `^[a-zA-Z0-9_-]{1,128}$`.
   */
  name?: string;
  /**
   * Tool description. Defaults to the operation's summary or description. This is the single most
   * important field for tool-selection accuracy: prefer an explicit, example-rich description.
   */
  description?: string;
  /**
   * Replaces the generated input schema entirely. Must be a JSON Schema of type object.
   */
  inputSchema?: any;
  /**
   * Schema of the structured content returned by the tool. Defaults to the schema of the operation's
   * 2xx JSON response, when that schema describes an object.
   */
  outputSchema?: any;
  /**
   * Behavioural hints. Defaults are derived from the HTTP method.
   */
  annotations?: MCPToolAnnotations;
  /**
   * Names of operation parameters to hide from the model, e.g. `format` and the `csv_*` family on query
   * operations, or parameters supplied by upstream middleware.
   */
  omitParameters?: string[];
  /**
   * Restricts this tool to a subset of the bundles the resource belongs to.
   */
  bundles?: string[];
}

export interface MCPToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * MCP opt-in options for a Resource, set as `mcp` in its ResourceDefinition.
 */
export interface MCPResourceOptions {
  /**
   * Bundles (i.e. MCP endpoints) this resource appears in. Defaults to `['default']`.
   */
  bundles?: string[];
  /**
   * Whitelist of operations to expose, by Operation.internalId (e.g. `['query', 'read']`). When absent,
   * every operation of the resource is a candidate.
   */
  operations?: string[];
  /**
   * Per-operation customization, keyed by Operation.internalId. Set an entry to `false` to hide it.
   */
  tools?: { [internalId: string]: MCPToolInfo | false };
}

/**
 * Definition of a bundle: a named, independently scoped group of MCP features exposed at its own
 * endpoint. Splitting a large API into bundles keeps each tool list small enough for a model to use
 * effectively, and lets a token be granted access to one bundle and not another.
 */
export interface MCPBundleDefinition {
  title?: string;
  description?: string;
  /**
   * Free-text usage instructions returned to the client during `initialize`.
   */
  instructions?: string;
  /**
   * Maximum length of the textual payload of a tool result. Defaults to MCP_DEFAULT_MAX_OUTPUT_CHARS.
   */
  maxOutputChars?: number;
}

export interface MCPOptions {
  /**
   * Base path of the MCP endpoints. Defaults to `mcp`, i.e. `POST /mcp` for the default bundle and
   * `POST /mcp/<bundleId>` for the others.
   */
  path?: string;
  /**
   * Bundles to expose. Defaults to a single bundle named `default`.
   */
  bundles?: { [id: string]: MCPBundleDefinition };
  /**
   * Server identity returned during `initialize`. Defaults to the API title and version.
   */
  serverInfo?: MCPImplementation;
  /**
   * Expose `GET <path>` returning the list of bundles reachable by the caller. Defaults to true.
   */
  catalogue?: boolean;
}

export interface MCPImplementation {
  name: string;
  version: string;
  title?: string;
}

export interface MCPTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: any;
  outputSchema?: any;
  annotations?: MCPToolAnnotations;
}

export interface MCPTextContent {
  type: 'text';
  text: string;
}
export interface MCPResourceLinkContent {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}
export type MCPContent = MCPTextContent | MCPResourceLinkContent;

export interface MCPToolResult {
  content: MCPContent[];
  structuredContent?: any;
  isError?: boolean;
}

export interface MCPResourceDescriptor {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}
export interface MCPResourceContents {
  contents: { uri: string; mimeType?: string; text?: string; blob?: string }[];
}
export interface MCPPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}
export interface MCPPromptResult {
  description?: string;
  messages: { role: 'user' | 'assistant'; content: MCPContent }[];
}

/**
 * Source of MCP features for a bundle. v1 of the arrest MCP server only calls the tool half of this
 * interface, but the resource and prompt methods are part of the contract: a subclass of MCPOperation
 * adding the corresponding JSON-RPC methods will have them advertised automatically, since
 * capabilities are derived from the methods the registered providers actually implement.
 */
export interface MCPProvider {
  listTools?(req: APIRequest): Promise<MCPTool[]>;
  callTool?(name: string, args: any, req: APIRequest): Promise<MCPToolResult>;
  listResources?(req: APIRequest): Promise<MCPResourceDescriptor[]>;
  readResource?(uri: string, req: APIRequest): Promise<MCPResourceContents>;
  listPrompts?(req: APIRequest): Promise<MCPPrompt[]>;
  getPrompt?(name: string, args: any, req: APIRequest): Promise<MCPPromptResult>;
}
