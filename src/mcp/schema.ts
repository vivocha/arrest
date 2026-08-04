import decamelize from 'decamelize';
import _ from 'lodash';
import { OpenAPIV3 } from 'openapi-police';
import { Method } from '../types.js';
import { MCPToolAnnotations } from './types.js';

const TOOL_NAME_INVALID_CHARS = /[^a-zA-Z0-9_-]+/g;
const COMPONENT_REF = /^#\/components\/([^/]+)\/([^/]+)$/;

/**
 * Name of the tool argument carrying the request body of the underlying operation.
 */
export const MCP_BODY_ARGUMENT = 'body';

/**
 * Derive an MCP tool name from a resource name and an operation id, e.g. ('Order', 'query') to
 * 'order_query'. The result always matches the `^[a-zA-Z0-9_-]{1,128}$` pattern required by MCP.
 */
export function toolNameFor(resourceName: string, internalId: string): string {
  const name = `${decamelize('' + resourceName, { separator: '_' })}_${decamelize('' + internalId, { separator: '_' })}`
    .replace(TOOL_NAME_INVALID_CHARS, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');
  return (name.length ? name : 'tool').substring(0, 128);
}

/**
 * Derive MCP behavioural hints from the HTTP method of an operation. These are hints only: MCP clients
 * use them to decide whether a call needs confirmation, they are not a security boundary.
 */
export function annotationsFor(method: Method): MCPToolAnnotations {
  return {
    readOnlyHint: method === 'get' || method === 'head' || method === 'options',
    destructiveHint: method === 'delete',
    idempotentHint: method === 'get' || method === 'head' || method === 'options' || method === 'put' || method === 'delete',
  };
}

/**
 * Resolve a local `#/components/<section>/<name>` reference against a document. Returns undefined for
 * anything else (external or deeper references), which callers treat as "leave the $ref alone".
 */
export function resolveComponentRef<T>(doc: OpenAPIV3.Document | undefined, ref: string): T | undefined {
  const match = COMPONENT_REF.exec(ref);
  if (!match || !doc || !doc.components) {
    return undefined;
  }
  const section = doc.components[match[1]];
  return section ? (section[match[2]] as T) : undefined;
}

interface SchemaBundler {
  defs: { [name: string]: any };
  bundle(schema: any): any;
}

/**
 * Copy a schema, moving every `#/components/schemas/X` reference it (transitively) depends on into
 * `$defs` and rewriting the references to `#/$defs/X`.
 *
 * Bundling rather than inlining is required because arrest schemas are frequently recursive: a resource
 * schema referencing itself would make inlining non-terminating.
 */
function createBundler(doc: OpenAPIV3.Document | undefined): SchemaBundler {
  const defs: { [name: string]: any } = {};
  const bundler: SchemaBundler = {
    defs,
    bundle(schema: any): any {
      if (Array.isArray(schema)) {
        return schema.map((i) => bundler.bundle(i));
      } else if (!schema || typeof schema !== 'object') {
        return schema;
      } else if (typeof schema.$ref === 'string') {
        const match = COMPONENT_REF.exec(schema.$ref);
        if (!match || match[1] !== 'schemas') {
          // not a local component schema reference: nothing sensible to bundle, leave as is
          return { ...schema };
        }
        const name = match[2];
        if (!(name in defs)) {
          // reserve the name *before* recursing, so a self-referencing schema terminates
          defs[name] = true;
          const target = resolveComponentRef<any>(doc, schema.$ref);
          defs[name] = typeof target === 'undefined' ? {} : bundler.bundle(target);
        }
        return { ...schema, $ref: `#/$defs/${name}` };
      } else {
        return Object.entries(schema).reduce((o, [key, value]) => {
          o[key] = key === 'enum' || key === 'const' || key === 'examples' || key === 'default' ? _.cloneDeep(value) : bundler.bundle(value);
          return o;
        }, {} as any);
      }
    },
  };
  return bundler;
}

/**
 * Collect the parameters of an operation, resolving `#/components/parameters/*` references.
 * Unresolvable references are skipped rather than passed through: a tool argument with no schema would
 * be worse than a missing one.
 */
export function operationParameters(info: OpenAPIV3.OperationObject, doc?: OpenAPIV3.Document): OpenAPIV3.ParameterObject[] {
  const out: OpenAPIV3.ParameterObject[] = [];
  for (const p of Array.from(info.parameters || [])) {
    const parameter: OpenAPIV3.ParameterObject | undefined =
      typeof (p as OpenAPIV3.ReferenceObject).$ref === 'string'
        ? resolveComponentRef<OpenAPIV3.ParameterObject>(doc, (p as OpenAPIV3.ReferenceObject).$ref)
        : (p as OpenAPIV3.ParameterObject);
    if (parameter && parameter.name && parameter.in !== 'cookie') {
      out.push(parameter);
    }
  }
  return out;
}

/**
 * The JSON request body schema of an operation, if any, alongside whether it is required.
 */
export function operationRequestBody(info: OpenAPIV3.OperationObject, doc?: OpenAPIV3.Document): { schema: any; required: boolean } | undefined {
  const body: OpenAPIV3.RequestBodyObject | undefined =
    typeof (info.requestBody as OpenAPIV3.ReferenceObject)?.$ref === 'string'
      ? resolveComponentRef<OpenAPIV3.RequestBodyObject>(doc, (info.requestBody as OpenAPIV3.ReferenceObject).$ref)
      : (info.requestBody as OpenAPIV3.RequestBodyObject | undefined);
  if (!body || !body.content) {
    return undefined;
  }
  const media = body.content['application/json'] || body.content['application/x-www-form-urlencoded'];
  if (!media || typeof media.schema === 'undefined') {
    return undefined;
  }
  return { schema: media.schema, required: body.required === true };
}

/**
 * The schema of the successful JSON response of an operation, if declared.
 */
export function operationResponseSchema(info: OpenAPIV3.OperationObject, doc?: OpenAPIV3.Document): any {
  const responses = info.responses || {};
  const code = Object.keys(responses).find((c) => /^2\d\d$/.test(c));
  if (!code) {
    return undefined;
  }
  const response: OpenAPIV3.ResponseObject | undefined =
    typeof (responses[code] as OpenAPIV3.ReferenceObject).$ref === 'string'
      ? resolveComponentRef<OpenAPIV3.ResponseObject>(doc, (responses[code] as OpenAPIV3.ReferenceObject).$ref)
      : (responses[code] as OpenAPIV3.ResponseObject);
  return response?.content?.['application/json']?.schema;
}

/**
 * Build the MCP `inputSchema` of a tool from the OpenAPI definition of an operation: each parameter
 * becomes a property named after it, and the JSON request body becomes a `body` property.
 *
 * The `info` and `doc` passed in must come from the *unresolved* OpenAPI document (see
 * API.getOriginalDocument()): once jsonref has parsed the document, `$ref`s are live proxies and
 * recursive schemas are circular, neither of which can be serialized to a client.
 */
export function operationToInputSchema(info: OpenAPIV3.OperationObject, doc?: OpenAPIV3.Document, omitParameters: string[] = []): any {
  const bundler = createBundler(doc);
  const properties: { [name: string]: any } = {};
  const required: string[] = [];

  for (const parameter of operationParameters(info, doc)) {
    if (omitParameters.includes(parameter.name)) {
      continue;
    }
    const schema = bundler.bundle(typeof parameter.schema === 'undefined' ? {} : parameter.schema);
    if (parameter.description && !schema.description) {
      schema.description = parameter.description;
    }
    properties[parameter.name] = schema;
    // path parameters are always required, as Operation.router() itself enforces
    if (parameter.required === true || parameter.in === 'path') {
      required.push(parameter.name);
    }
  }

  const body = operationRequestBody(info, doc);
  if (body && !omitParameters.includes(MCP_BODY_ARGUMENT)) {
    const schema = bundler.bundle(body.schema);
    properties[MCP_BODY_ARGUMENT] = typeof schema === 'object' && schema !== null ? { description: 'Body of the request', ...schema } : schema;
    if (body.required) {
      required.push(MCP_BODY_ARGUMENT);
    }
  }

  const out: any = { type: 'object', properties };
  if (required.length) {
    out.required = required;
  }
  if (Object.keys(bundler.defs).length) {
    out.$defs = bundler.defs;
  }
  return out;
}

/**
 * Build the MCP `outputSchema` of a tool, i.e. the schema of its `structuredContent`. MCP requires
 * structured content to be a JSON object, so operations returning arrays or scalars get no output
 * schema and report their result as text only.
 */
export function operationToOutputSchema(info: OpenAPIV3.OperationObject, doc?: OpenAPIV3.Document): any {
  const schema = operationResponseSchema(info, doc);
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  // a $ref'd response schema has to be resolved before we can tell whether it describes an object
  const resolved: any = typeof schema.$ref === 'string' ? resolveComponentRef<any>(doc, schema.$ref) : schema;
  if (!resolved || typeof resolved !== 'object' || resolved.type !== 'object') {
    return undefined;
  }
  const bundler = createBundler(doc);
  const bundled = bundler.bundle(schema);
  // MCP mandates an object output schema, so a bare $ref is wrapped rather than followed
  const out = typeof bundled.$ref === 'string' ? { type: 'object', allOf: [bundled] } : bundled;
  if (Object.keys(bundler.defs).length) {
    out.$defs = bundler.defs;
  }
  return out;
}
