import { defineAbility } from '@casl/ability';
import { Scopes } from '@vivocha/scopes';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import express from 'express';
import supertest from 'supertest';
import { API } from '../../dist/api.js';
import { dispatchInternal } from '../../dist/mcp/dispatch.js';
import { MCPOperation } from '../../dist/mcp/operation.js';
import { DynamicToolProvider, providerHasTool, ResourceToolProvider } from '../../dist/mcp/provider.js';
import { MCPResource } from '../../dist/mcp/resource.js';
import { Operation } from '../../dist/operation.js';
import { Job, PipelineOperation } from '../../dist/pipeline.js';
import { Resource } from '../../dist/resource.js';
import { rpc } from '../../dist/rpc.js';
import { APIRequest, APIResponse, Method } from '../../dist/types.js';

chai.use(chaiAsPromised);
const should = chai.should();

const port = 9876;
const basePath = 'http://localhost:' + port;

/**
 * A minimal set of operations, enough to exercise every branch of the tool derivation and of the
 * internal dispatch, without depending on a database.
 */
class QueryOp extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'query');
  }
  protected getCustomInfo(): any {
    return {
      summary: 'Retrieve a list of things',
      parameters: [{ $ref: '#/components/parameters/limit' }, { $ref: '#/components/parameters/skip' }, { $ref: '#/components/parameters/format' }],
      responses: {
        '200': {
          description: 'a list of things',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/thing' } } } },
        },
      },
    };
  }
  handler(req: APIRequest, res: APIResponse) {
    res.set('Results-Matching', '10');
    res.set('Results-Skipped', '' + (req.query.skip || 0));
    res.set('Link', '<' + basePath + '/things?limit=1&skip=1>; rel="next"');
    res.json([{ a: 'x' }, { a: 'y' }]);
  }
}

class ReadOp extends PipelineOperation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'read');
  }
  protected getCustomInfo(): any {
    return {
      summary: 'Retrieve a thing',
      parameters: [{ $ref: '#/components/parameters/id' }, { name: 'x-flavour', in: 'header', schema: { type: 'string' } }],
      responses: {
        '200': { description: 'a thing', content: { 'application/json': { schema: { $ref: '#/components/schemas/thing' } } } },
      },
    };
  }
  async runOperation(job: Job): Promise<Job> {
    if (job.req.params.id === 'missing') {
      API.fireError(404, 'not_found');
    }
    job.data = { id: job.req.params.id, a: 'x', ...(job.req.headers['x-flavour'] ? { flavour: job.req.headers['x-flavour'] } : {}) };
    return job;
  }
}

class CreateOp extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'create');
  }
  protected getCustomInfo(): any {
    return {
      summary: 'Create a thing',
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/thing' } } } },
      responses: {
        '201': { description: 'the created thing', content: { 'application/json': { schema: { $ref: '#/components/schemas/thing' } } } },
      },
    };
  }
  handler(req: APIRequest, res: APIResponse) {
    res.status(201).json(req.body);
  }
}

class RemoveOp extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'remove');
  }
  protected getCustomInfo(): any {
    return {
      summary: 'Delete a thing',
      parameters: [{ $ref: '#/components/parameters/id' }],
      responses: { '200': { description: 'deleted' } },
    };
  }
  handler(req: APIRequest, res: APIResponse) {
    res.json({ deleted: req.params.id });
  }
}

function jsonrpc(request: supertest.Agent, path: string, body: any): supertest.Test {
  return request.post(path).send(body);
}

describe('MCP', function () {
  describe('protocol', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    const api = new API();
    api.document.components!.securitySchemes = {
      oauth2: { type: 'oauth2', flows: { password: { tokenUrl: 'token', scopes: {} } } },
    };
    api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
    api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/': { get: QueryOp as any } }));
    api.addResource(new MCPResource({ bundles: { default: { instructions: 'Use these tools wisely.' } } }));

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });

    it('should reply to initialize with the default protocol version', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
        .expect(200)
        .then(({ body: data }) => {
          data.jsonrpc.should.equal('2.0');
          data.result.protocolVersion.should.equal('2025-06-18');
          data.result.capabilities.should.deep.equal({ tools: { listChanged: false } });
          data.result.serverInfo.name.should.equal('REST API');
          data.result.serverInfo.version.should.equal('1.0.0');
          data.result.instructions.should.equal('Use these tools wisely.');
        });
    });
    it('should reply to initialize without params', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' })
        .expect(200)
        .then(({ body: data }) => {
          data.result.protocolVersion.should.equal('2025-06-18');
        });
    });
    it('should echo a supported protocol version requested by the client', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })
        .expect(200)
        .then(({ body: data }) => {
          data.result.protocolVersion.should.equal('2025-03-26');
        });
    });
    it('should fall back to the default version if the client asks for an unsupported one', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
        .expect(200)
        .then(({ body: data }) => {
          data.result.protocolVersion.should.equal('2025-06-18');
        });
    });
    it('should treat a request with id 0 as a request, not as a notification', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 0, method: 'ping' })
        .expect(200)
        .then(({ body: data }) => {
          data.id.should.equal(0);
          data.result.should.deep.equal({});
        });
    });
    it('should answer a notification with 202 and no body', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' })
        .expect(202)
        .expect('Content-Length', '0');
    });
    it('should answer a notification with a null id with 202', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: null, method: 'notifications/initialized' }).expect(202);
    });
    it('should reject an unknown method', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 2, method: 'resources/list' })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32601);
          data.id.should.equal(2);
        });
    });
    it('should reject a batch request', function () {
      return jsonrpc(request, '/mcp', [{ jsonrpc: '2.0', id: 1, method: 'ping' }])
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32600);
          data.error.message.should.equal('Invalid request');
          should.not.exist(data.id);
        });
    });
    it('should return a 404 for an unknown bundle', function () {
      return request.get('/mcp/nope').expect(404);
    });
    it('should document the endpoint in the OpenAPI spec', function () {
      return request
        .get('/openapi.json')
        .expect(200)
        .then(({ body: doc }) => {
          should.exist(doc.paths['/mcp'].post);
          doc.paths['/mcp'].post.operationId.should.equal('MCP.default');
          doc.paths['/mcp'].post.summary.should.equal('MCP endpoint');
          doc.paths['/mcp'].post.description.should.match(/^Model Context Protocol/);
          should.exist(doc.paths['/mcp'].post.responses['202']);
          should.exist(doc.paths['/mcp'].get);
          should.exist(doc.components.securitySchemes.oauth2.flows.password.scopes['MCP.default']);
          should.exist(doc.components.securitySchemes.oauth2.flows.password.scopes['MCP']);
        });
    });
    it('should document a named bundle with its own title and description', function () {
      const api = new API();
      api.addResource(new MCPResource({ bundles: { sales: { title: 'Sales tools', description: 'Tools for the sales team' } } }));
      const info = (api.document.paths!['/mcp/sales'] as any).post;
      info.operationId.should.equal('MCP.sales');
      info.summary.should.equal('Sales tools');
      info.description.should.equal('Tools for the sales team');
    });
    it('should document a named bundle with no title or description', function () {
      const api = new API();
      api.addResource(new MCPResource({ bundles: { sales: {} } }));
      const info = (api.document.paths!['/mcp/sales'] as any).post;
      info.summary.should.equal('MCP endpoint for the sales bundle');
      info.description.should.match(/^Model Context Protocol/);
    });
  });

  describe('tools/list', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    class CustomOp extends ReadOp {
      get mcpTool() {
        return { name: 'get_the_custom_thing', description: 'A custom description', annotations: { title: 'Custom' } };
      }
    }
    class HiddenOp extends ReadOp {
      get mcpTool() {
        return false as false;
      }
    }

    const api = new API();
    api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
    // opted in with the shorthand: every operation, default bundle
    api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/': { get: QueryOp as any, post: CreateOp as any }, '/:id': { get: ReadOp as any } }));
    // opted out
    api.addResource(new Resource({ name: 'Secret' }, { '/': { get: QueryOp as any } }));
    // selective opt in
    api.addResource(
      new Resource(
        {
          name: 'Order',
          mcp: {
            bundles: ['default', 'sales'],
            operations: ['query', 'read', 'create'],
            tools: {
              query: { name: 'search_orders', description: 'Search orders', omitParameters: ['format'] },
              read: { bundles: ['sales'], outputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
              create: false,
            },
          },
        },
        { '/': { get: QueryOp as any, post: CreateOp as any }, '/:id': { get: ReadOp as any, delete: RemoveOp as any } }
      )
    );
    // customization from the operation itself
    api.addResource(
      new Resource({ name: 'Custom', mcp: { bundles: ['sales'] } }, { '/:id': { get: CustomOp as any }, '/hidden/:id': { get: HiddenOp as any } })
    );
    api.addResource(new MCPResource({ bundles: { default: {}, sales: { title: 'Sales tools', description: 'Tools for the sales team' } } }));

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });

    async function list(path: string): Promise<any[]> {
      const { body } = await jsonrpc(request, path, { jsonrpc: '2.0', id: 1, method: 'tools/list' }).expect(200);
      return body.result.tools;
    }

    it('should only expose the operations of the resources that opted in', async function () {
      const names = (await list('/mcp')).map((t) => t.name);
      names.should.have.members(['thing_query', 'thing_create', 'thing_read', 'search_orders']);
    });
    it('should derive names, descriptions and annotations from the operation', async function () {
      const tools = await list('/mcp');
      const read = tools.find((t) => t.name === 'thing_read');
      read.description.should.equal('Retrieve a thing');
      read.annotations.should.deep.equal({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
      const create = tools.find((t) => t.name === 'thing_create');
      create.annotations.readOnlyHint.should.be.false;
    });
    it('should derive the input schema from the parameters and the request body', async function () {
      const tools = await list('/mcp');
      const read = tools.find((t) => t.name === 'thing_read');
      read.inputSchema.should.deep.equal({
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique identifier of the resource' },
          'x-flavour': { type: 'string' },
        },
        required: ['id'],
      });
      const create = tools.find((t) => t.name === 'thing_create');
      create.inputSchema.required.should.deep.equal(['body']);
      create.inputSchema.properties.body.$ref.should.equal('#/$defs/thing');
      should.exist(create.inputSchema.$defs.thing);
    });
    it('should derive an output schema only for object responses', async function () {
      const tools = await list('/mcp');
      tools.find((t) => t.name === 'thing_read').outputSchema.should.deep.equal({
        type: 'object',
        allOf: [{ $ref: '#/$defs/thing' }],
        $defs: { thing: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } },
      });
      should.not.exist(tools.find((t) => t.name === 'thing_query').outputSchema);
    });
    it('should honour the resource level tool customization', async function () {
      const tools = await list('/mcp');
      const query = tools.find((t) => t.name === 'search_orders');
      query.description.should.equal('Search orders');
      Object.keys(query.inputSchema.properties).should.have.members(['limit', 'skip']);
    });
    it('should honour the operations whitelist', async function () {
      (await list('/mcp/sales')).map((t) => t.name).should.not.include('order_remove');
    });
    it('should hide an operation disabled at the resource level', async function () {
      (await list('/mcp/sales')).map((t) => t.name).should.not.include('order_create');
    });
    it('should hide an operation disabled by its own mcpTool', async function () {
      (await list('/mcp/sales')).map((t) => t.name).should.not.include('custom_query');
    });
    it('should honour the operation level customization', async function () {
      const tool = (await list('/mcp/sales')).find((t) => t.name === 'get_the_custom_thing');
      tool.description.should.equal('A custom description');
      tool.title.should.equal('Custom');
      tool.annotations.title.should.equal('Custom');
    });
    it('should honour an explicitly configured output schema', async function () {
      (await list('/mcp/sales'))
        .find((t) => t.name === 'order_read')
        .outputSchema.should.deep.equal({ type: 'object', properties: { id: { type: 'string' } } });
    });
    it('should isolate bundles from each other', async function () {
      const sales = (await list('/mcp/sales')).map((t) => t.name);
      const dflt = (await list('/mcp')).map((t) => t.name);
      sales.should.have.members(['search_orders', 'order_read', 'get_the_custom_thing']);
      dflt.should.not.include('order_read');
      dflt.should.not.include('get_the_custom_thing');
    });
    it('should serve the catalogue of bundles', function () {
      return request
        .get('/mcp')
        .expect(200)
        .then(({ body: data }) => {
          data.length.should.equal(2);
          data[0].id.should.equal('default');
          data[0].url.should.equal(basePath + '/mcp');
          should.not.exist(data[0].title);
          data[0].tools.should.have.members(['thing_query', 'thing_create', 'thing_read', 'search_orders']);
          data[1].id.should.equal('sales');
          data[1].title.should.equal('Sales tools');
          data[1].description.should.equal('Tools for the sales team');
          data[1].url.should.equal(basePath + '/mcp/sales');
        });
    });
    it('should advertise the title of a bundle in its server info', function () {
      return jsonrpc(request, '/mcp/sales', { jsonrpc: '2.0', id: 1, method: 'initialize' })
        .expect(200)
        .then(({ body: data }) => {
          data.result.serverInfo.name.should.equal('REST API (sales)');
          data.result.serverInfo.title.should.equal('Sales tools');
          should.not.exist(data.result.instructions);
        });
    });
  });

  describe('tools/call', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    const api = new API();
    api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
    api.addResource(
      new Resource(
        { name: 'Thing', mcp: true },
        { '/': { get: QueryOp as any, post: CreateOp as any }, '/:id': { get: ReadOp as any, delete: RemoveOp as any } }
      )
    );
    api.addResource(new MCPResource());

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });

    async function call(name: string, args?: any): Promise<any> {
      const { body } = await jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).expect(200);
      should.not.exist(body.error);
      return body.result;
    }

    it('should perform an operation with a path parameter', async function () {
      const result = await call('thing_read', { id: 'abc' });
      should.not.exist(result.isError);
      result.content[0].type.should.equal('text');
      JSON.parse(result.content[0].text).should.deep.equal({ id: 'abc', a: 'x' });
      result.structuredContent.should.deep.equal({ id: 'abc', a: 'x' });
    });
    it('should pass header arguments as headers', async function () {
      const result = await call('thing_read', { id: 'abc', 'x-flavour': 'vanilla' });
      result.structuredContent.flavour.should.equal('vanilla');
    });
    it('should perform an operation with no arguments', async function () {
      const result = await call('thing_query');
      JSON.parse(result.content[0].text).should.deep.equal([{ a: 'x' }, { a: 'y' }]);
    });
    it('should not report structured content for an array result', async function () {
      should.not.exist((await call('thing_query')).structuredContent);
    });
    it('should surface the pagination metadata of a query', async function () {
      const result = await call('thing_query', { limit: 1, skip: 1 });
      result.content.length.should.equal(2);
      result.content[1].text.should.equal('10 items match the query, 1 skipped, more items are available: repeat the call increasing skip');
    });
    it('should pass a request body', async function () {
      const result = await call('thing_create', { body: { a: 'z' } });
      result.structuredContent.should.deep.equal({ a: 'z' });
    });
    it('should perform a delete', async function () {
      (await call('thing_remove', { id: 'abc' })).content[0].text.should.match(/deleted/);
    });
    it('should report a failing operation as a tool error, with the API error body', async function () {
      const result = await call('thing_read', { id: 'missing' });
      result.isError.should.be.true;
      result.content[0].text.should.match(/^The operation failed with status 404: /);
      JSON.parse(result.content[0].text.replace(/^[^{]+/, '')).should.deep.equal({ error: 404, message: 'not_found' });
    });
    it('should report a validation failure as a tool error', async function () {
      const result = await call('thing_query', { limit: 100000 });
      result.isError.should.be.true;
      const body = JSON.parse(result.content[0].text.replace(/^[^{]+/, ''));
      body.error.should.equal(400);
      body.message.should.equal('ValidationError');
      body.info.path.should.equal('query.limit');
    });
    it('should report a body validation failure as a tool error', async function () {
      const result = await call('thing_create', { body: { a: 12 } });
      result.isError.should.be.true;
      result.content[0].text.should.match(/status 400/);
    });
    it('should coerce argument values through the operation validators', async function () {
      const result = await call('thing_query', { limit: '1' });
      should.not.exist(result.isError);
    });
    it('should pass an unknown argument to the query string, letting the operation decide', async function () {
      should.not.exist((await call('thing_query', { whatever: 'x' })).isError);
    });
    it('should serialize array and object arguments into the query string', async function () {
      should.not.exist((await call('thing_query', { tags: ['a', 'b'], nested: { x: 1 }, nope: undefined })).isError);
    });
    it('should reject a call without a tool name', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32602);
          data.error.message.should.match(/Missing tool name/);
        });
    });
    it('should reject a call without params', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call' })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32602);
        });
    });
    it('should reject a call to an unknown tool', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32602);
          data.error.message.should.match(/Unknown tool nope/);
        });
    });
  });

  describe('security', function () {
    describe('scopes', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      class ScopedAPI extends API {
        initSecurity(req: APIRequest, res: APIResponse, next: express.NextFunction) {
          req.scopes = new Scopes(JSON.parse('' + (req.headers['x-scopes'] || '["*"]')));
          next();
        }
      }
      const api = new ScopedAPI();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/': { get: QueryOp as any }, '/:id': { get: ReadOp as any } }));
      api.addResource(new MCPResource({ bundles: { default: {}, sales: {} } }));

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should reject a call to a bundle the caller has no scope for', function () {
        return request
          .post('/mcp')
          .set('x-scopes', '["Thing"]')
          .send({ jsonrpc: '2.0', id: 1, method: 'ping' })
          .expect(403);
      });
      it('should hide the tools the caller is not authorized to use', function () {
        return request
          .post('/mcp')
          .set('x-scopes', '["MCP", "Thing.query"]')
          .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.map((t) => t.name).should.deep.equal(['thing_query']);
          });
      });
      it('should report an unauthorized tool as unknown', function () {
        return request
          .post('/mcp')
          .set('x-scopes', '["MCP", "Thing.query"]')
          .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'thing_read', arguments: { id: 'a' } } })
          .expect(200)
          .then(({ body: data }) => {
            data.error.code.should.equal(-32602);
            data.error.message.should.match(/Unknown tool/);
          });
      });
      it('should expose no tool at all to a caller holding the bundle scope only', function () {
        return request
          .post('/mcp')
          .set('x-scopes', '["MCP.default"]')
          .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.should.deep.equal([]);
          });
      });
      it('should advertise tool capabilities regardless of what the caller can reach', function () {
        return request
          .post('/mcp')
          .set('x-scopes', '["MCP.default"]')
          .send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.capabilities.should.deep.equal({ tools: { listChanged: false } });
          });
      });
      it('should list in the catalogue only the bundles the caller can reach', function () {
        return request
          .get('/mcp')
          .set('x-scopes', '["MCP.catalogue", "MCP.default", "Thing.query"]')
          .expect(200)
          .then(({ body: data }) => {
            data.length.should.equal(1);
            data[0].id.should.equal('default');
            data[0].tools.should.deep.equal(['thing_query']);
          });
      });
      it('should return the same result as the equivalent REST call', async function () {
        const scopes = '["MCP", "Thing"]';
        const { body: rest } = await request.get('/things/abc').set('x-scopes', scopes).expect(200);
        const { body: mcp } = await request
          .post('/mcp')
          .set('x-scopes', scopes)
          .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'thing_read', arguments: { id: 'abc' } } })
          .expect(200);
        mcp.result.structuredContent.should.deep.equal(rest);
      });
      it('should hide an unreachable bundle from an authorization filtered openapi spec', async function () {
        // the same property the catalogue and tools/list have, seen from the OpenAPI document
        const { body: all } = await request.get('/openapi.json?filter=authorized').expect(200);
        Object.keys(all.paths).should.include.members(['/mcp', '/mcp/sales']);
        const { body: some } = await request.get('/openapi.json?filter=authorized').set('x-scopes', '["MCP.default", "Thing"]').expect(200);
        Object.keys(some.paths['/mcp']).should.deep.equal(['post']);
        Object.keys(some.paths).should.not.include('/mcp/sales');
      });
    });

    describe('ability', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      class AbilityAPI extends API {
        initSecurity(req: APIRequest, res: APIResponse, next: express.NextFunction) {
          req.ability = defineAbility((can) => {
            if (req.headers['x-full']) {
              can('manage', 'all');
            } else {
              can('read', 'Thing', ['id']);
              can('default', 'MCP');
            }
          }) as any;
          next();
        }
      }
      const api = new AbilityAPI();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/': { get: QueryOp as any }, '/:id': { get: ReadOp as any } }));
      api.addResource(new MCPResource());

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should hide the tools not permitted by the ability', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.map((t) => t.name).should.deep.equal(['thing_read']);
          });
      });
      it('should list every tool for an unrestricted ability', function () {
        return request
          .post('/mcp')
          .set('x-full', '1')
          .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.map((t) => t.name).should.have.members(['thing_query', 'thing_read']);
          });
      });
      it('should redact the result exactly like the equivalent REST call', async function () {
        const { body: rest } = await request.get('/things/abc').expect(200);
        rest.should.deep.equal({ id: 'abc' });
        const { body: mcp } = await jsonrpc(request, '/mcp', {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'thing_read', arguments: { id: 'abc' } },
        }).expect(200);
        mcp.result.structuredContent.should.deep.equal(rest);
      });
    });

    describe('no scopes', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      class PublicOp extends ReadOp {
        get swaggerScopes() {
          return {};
        }
      }
      // an MCP endpoint is never public by default: to run without any authentication at all, the bundle
      // operation has to drop its own scope explicitly
      class PublicMCPOperation extends MCPOperation {
        get swaggerScopes() {
          return {};
        }
      }
      class PublicMCPResource extends MCPResource {
        protected createOperation(bundleId: string, path: string) {
          return new PublicMCPOperation(this, path, 'post', bundleId);
        }
      }
      class NoSecurityAPI extends API {
        initSecurity(req: APIRequest, res: APIResponse, next: express.NextFunction) {
          next();
        }
      }
      const api = new NoSecurityAPI();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/:id': { get: PublicOp as any }, '/x/:id': { delete: RemoveOp as any } }));
      api.addResource(new PublicMCPResource({ catalogue: false }));

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should expose an operation with no scopes and hide the ones requiring scopes', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.map((t) => t.name).should.deep.equal(['thing_read']);
          });
      });
      it('should refuse to serve a tool whose operation requires a scope', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'thing_remove', arguments: { id: 'a' } } })
          .expect(200)
          .then(({ body: data }) => {
            data.error.code.should.equal(-32602);
          });
      });
    });
  });

  describe('customization', function () {
    it('should default to a single bundle named default', function () {
      const r = new MCPResource();
      r.getBundleIds().should.deep.equal(['default']);
      r.getBundle('default').should.deep.equal({});
      r.getBundle('nope').should.deep.equal({});
    });
    it('should default to a single bundle if an empty bundle map is passed', function () {
      new MCPResource({ bundles: {} }).getBundleIds().should.deep.equal(['default']);
    });
    it('should describe its scope', function () {
      new MCPResource().scopeDescription.should.match(/MCP/);
    });
    it('should refuse a provider for an unknown bundle', function () {
      (() => new MCPResource().addProvider('nope', {})).should.throw(/Unknown MCP bundle/);
    });
    it('should serve the default bundle when constructed without an explicit id', function () {
      const op = new MCPOperation(new MCPResource(), '/');
      op.bundleId.should.equal('default');
      // before attach() there is no document to take the server identity from
      op.serverInfo.should.deep.equal({ name: 'REST API', version: '1.0.0' });
    });
    it('should derive a tool from an operation of an API whose document has not been resolved yet', async function () {
      const api = new API();
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/:id': { get: RemoveOp as any } }));
      const mcp = new MCPResource();
      api.addResource(mcp);
      const req: any = { logger: console, scopes: new Scopes('*') };
      // no router() call, so getOriginalDocument() is undefined and the live operation info is used instead
      const tools = await (mcp.getProviders('default')[0] as any).listTools(req);
      tools.map((t) => t.name).should.deep.equal(['thing_remove']);
      tools[0].description.should.equal('Delete a thing');
    });

    describe('with a custom path, no catalogue, custom server info and an extra provider', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing' }, { '/': { get: QueryOp as any } }));
      const mcp = new MCPResource({
        path: 'tools',
        catalogue: false,
        serverInfo: { name: 'My Server', version: '9.9.9' },
        bundles: { default: { maxOutputChars: 40 } },
      });
      mcp.addProvider('default', {
        async listTools() {
          return [{ name: 'hello', description: 'Say hello', inputSchema: { type: 'object', properties: {} } }];
        },
        async callTool(name: string) {
          return { content: [{ type: 'text' as const, text: `hello from ${name}, and here is some more text to push this over the limit` }] };
        },
      });
      api.addResource(mcp);

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should serve the endpoint at the custom path with the custom server info', function () {
        return jsonrpc(request, '/tools', { jsonrpc: '2.0', id: 1, method: 'initialize' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.serverInfo.should.deep.equal({ name: 'My Server', version: '9.9.9' });
          });
      });
      it('should not serve a catalogue', function () {
        return request.get('/tools').expect(405);
      });
      it('should expose the tools of the extra provider', function () {
        return jsonrpc(request, '/tools', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.map((t) => t.name).should.deep.equal(['hello']);
          });
      });
      it('should call the tools of the extra provider, truncating the output', function () {
        return jsonrpc(request, '/tools', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'hello' } })
          .expect(200)
          .then(({ body: data }) => {
            data.result.content[0].text.should.equal(
              'hello from hello, and here is some more \n\n[output truncated at 40 characters; narrow the request with the limit, fields or q arguments]'
            );
          });
      });
    });

    describe('with a provider that serves no tools', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const mcp = new MCPResource();
      mcp.addProvider('default', {});
      api.addResource(mcp);

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should advertise no capability', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.capabilities.should.deep.equal({});
          });
      });
      it('should list no tool', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.should.deep.equal([]);
          });
      });
      it('should report an empty catalogue entry', function () {
        return request
          .get('/mcp')
          .expect(200)
          .then(({ body: data }) => {
            data.should.deep.equal([{ id: 'default', url: basePath + '/mcp', tools: [] }]);
          });
      });
    });

    describe('with two providers exposing the same tool name', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const mcp = new MCPResource();
      const tool = { name: 'clash', inputSchema: { type: 'object' } };
      mcp.addProvider('default', { async listTools() { return [tool]; } });
      mcp.addProvider('default', { async listTools() { return [tool]; } });
      api.addResource(mcp);

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should fail with an internal error naming the clashing tool', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.error.code.should.equal(-32603);
            data.error.message.should.equal('internal error');
          });
      });
    });

    describe('with a subclassed provider and operation', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      class MyProvider extends ResourceToolProvider {
        protected getToolInfo(op: Operation) {
          return { ...super.getToolInfo(op), description: `Tool for ${op.info.operationId}` };
        }
      }
      class MyMCPResource extends MCPResource {
        protected createProvider(resource: Resource, bundleId: string) {
          return new MyProvider(resource, bundleId, this.getBundle(bundleId));
        }
        protected createOperation(bundleId: string, path: string) {
          return new MyMCPOperation(this, path, 'post', bundleId);
        }
      }
      class MyMCPOperation extends MCPOperation {
        get serverInfo() {
          return { name: 'Subclassed', version: '1.0.0' };
        }
      }

      const api = new API();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/:id': { get: ReadOp as any } }));
      api.addResource(new MyMCPResource());

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should use the subclassed operation', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.serverInfo.name.should.equal('Subclassed');
          });
      });
      it('should use the subclassed provider', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools[0].description.should.equal('Tool for Thing.read');
          });
      });
    });

    describe('with a resource added after the MCP resource', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new MCPResource());
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/:id': { get: ReadOp as any } }));

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should still expose its tools', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            data.result.tools.map((t) => t.name).should.deep.equal(['thing_read']);
          });
      });
    });

    describe('with an operation carrying no OpenAPI information', function () {
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      api.addResource(
        new Resource(
          { name: 'Thing', mcp: true },
          {
            '/': {
              get: (req: APIRequest, res: APIResponse) => {
                res.json({ ok: true });
              },
            },
          }
        )
      );
      api.addResource(new MCPResource());

      before(async function () {
        app.use(await api.router());
        server = app.listen(port);
      });
      after(function () {
        server.close();
      });

      it('should derive a usable tool anyway', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
          .expect(200)
          .then(({ body: data }) => {
            const tool = data.result.tools[0];
            tool.name.should.equal('thing_get');
            tool.description.should.equal('Execute Thing.get');
            tool.inputSchema.should.deep.equal({ type: 'object', properties: {} });
            should.not.exist(tool.outputSchema);
          });
      });
      it('should call it anyway', function () {
        return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'thing_get' } })
          .expect(200)
          .then(({ body: data }) => {
            data.result.content[0].text.should.equal('{\n  "ok": true\n}');
          });
      });
    });
  });

  describe('internal dispatch', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    class TextOp extends Operation {
      constructor(resource: Resource, path: string, method: Method) {
        super(resource, path, method, 'text');
      }
      protected getCustomInfo(): any {
        return { summary: 'Return plain text', responses: { '200': { description: 'text' } } };
      }
      handler(req: APIRequest, res: APIResponse) {
        res.type('text/plain').send('just text');
      }
    }
    class ThrowOp extends Operation {
      constructor(resource: Resource, path: string, method: Method) {
        super(resource, path, method, 'boom');
      }
      protected getCustomInfo(): any {
        return { summary: 'Fail', responses: { '200': { description: 'never' } } };
      }
      handler(req: APIRequest, res: APIResponse, next?: express.NextFunction) {
        next!(new Error('boom'));
      }
    }
    class EmptyOp extends Operation {
      constructor(resource: Resource, path: string, method: Method) {
        super(resource, path, method, 'empty');
      }
      protected getCustomInfo(): any {
        return { summary: 'Return nothing', responses: { '204': { description: 'nothing' } } };
      }
      handler(req: APIRequest, res: APIResponse) {
        res.status(204).end();
      }
    }
    class BrokenJSONOp extends Operation {
      constructor(resource: Resource, path: string, method: Method) {
        super(resource, path, method, 'broken');
      }
      protected getCustomInfo(): any {
        return { summary: 'Return broken json', responses: { '200': { description: 'broken' } } };
      }
      handler(req: APIRequest, res: APIResponse) {
        res.type('application/json').send('{not json');
      }
    }
    class ChunkedOp extends Operation {
      constructor(resource: Resource, path: string, method: Method) {
        super(resource, path, method, 'chunked');
      }
      protected getCustomInfo(): any {
        return { summary: 'Return a buffer in chunks', responses: { '200': { description: 'chunks' } } };
      }
      handler(req: APIRequest, res: APIResponse) {
        res.type('text/plain');
        res.write(Buffer.from('first '));
        res.end(Buffer.from('second'));
      }
    }

    /**
     * An API whose error reporting itself fails, to exercise the one case in which the router runs out of
     * handlers with an error still pending.
     */
    class BrokenAPI extends API {
      handleError(err: any, req: APIRequest, res: APIResponse, next?: express.NextFunction) {
        if (req.headers['x-break-error-handling']) {
          throw new Error('cannot report');
        }
        super.handleError(err, req, res, next);
      }
    }

    const api = new BrokenAPI();
    api.addResource(
      new Resource(
        { name: 'Thing', mcp: true },
        {
          '/text': { get: TextOp as any },
          '/boom': { get: ThrowOp as any },
          '/empty': { get: EmptyOp as any },
          '/broken': { get: BrokenJSONOp as any },
          '/chunked': { get: ChunkedOp as any },
        }
      )
    );
    const mcp = new MCPResource();
    // dispatches whatever url the model asks for, so that responses no operation produced can be observed
    mcp.addProvider('default', {
      async listTools() {
        return [{ name: 'fetch', inputSchema: { type: 'object', properties: { url: { type: 'string' } } } }];
      },
      async callTool(_name: string, args: any, req: APIRequest) {
        const response = await dispatchInternal(api, req, { method: 'get', url: args.url });
        return { content: [{ type: 'text' as const, text: JSON.stringify(response.body) }] };
      },
    });
    api.addResource(mcp);

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });

    async function call(name: string): Promise<any> {
      const { body } = await jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name } }).expect(200);
      return body.result;
    }

    it('should return a non json payload as text', async function () {
      const result = await call('thing_text');
      result.content[0].text.should.equal('just text');
      should.not.exist(result.structuredContent);
    });
    it('should return an empty payload as an empty string', async function () {
      (await call('thing_empty')).content[0].text.should.equal('');
    });
    it('should return an unparseable json payload as text', async function () {
      (await call('thing_broken')).content[0].text.should.equal('{not json');
    });
    it('should reassemble a payload written in several chunks', async function () {
      (await call('thing_chunked')).content[0].text.should.equal('first second');
    });
    it('should map an unhandled error of the operation to a tool error', async function () {
      const result = await call('thing_boom');
      result.isError.should.be.true;
      result.content[0].text.should.match(/status 500/);
    });
    it('should report a 404 when no operation matches the url', async function () {
      const result = await jsonrpc(request, '/mcp', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'fetch', arguments: { url: '/nope/at/all' } },
      }).expect(200);
      JSON.parse(result.body.result.content[0].text).should.deep.equal({
        error: 404,
        message: 'Not Found',
        info: 'the requested resource cannot be found, check the endpoint URL',
      });
    });
    it('should surface an error the API declined to report', function () {
      return request
        .post('/mcp')
        .set('x-break-error-handling', '1')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fetch', arguments: { url: '/things/boom' } } })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32603);
          data.error.message.should.equal('internal error');
        });
    });
  });

  describe('extending the protocol surface', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    /**
     * The deferred half of the MCP surface, implemented the way the module intends it to be: a subclass
     * adding the JSON-RPC methods, and providers implementing the matching MCPProvider methods. Neither
     * MCPOperation nor MCPResource needs to know about any of it.
     */
    class FullMCPOperation extends MCPOperation {
      @rpc
      async 'resources/list'(_params: any, req: APIRequest): Promise<any> {
        const resources: any[] = [];
        for (const provider of this.getProviders()) {
          if (provider.listResources) {
            resources.push(...(await provider.listResources(req)));
          }
        }
        return { resources };
      }
      @rpc
      async 'prompts/list'(_params: any, req: APIRequest): Promise<any> {
        const prompts: any[] = [];
        for (const provider of this.getProviders()) {
          if (provider.listPrompts) {
            prompts.push(...(await provider.listPrompts(req)));
          }
        }
        return { prompts };
      }
      /**
       * A method taking over the response itself, as a streaming implementation would.
       */
      @rpc
      async stream(_params: any, _req: APIRequest, res: APIResponse): Promise<void> {
        res.type('text/event-stream').send('data: hello\n\n');
      }
    }
    class FullMCPResource extends MCPResource {
      protected createOperation(bundleId: string, path: string) {
        return new FullMCPOperation(this, path, 'post', bundleId);
      }
    }

    const api = new API();
    const mcp = new FullMCPResource();
    mcp.addProvider('default', {
      async listResources() {
        return [{ uri: 'thing://1', name: 'The first thing' }];
      },
      async readResource(uri: string) {
        return { contents: [{ uri, text: 'content' }] };
      },
      async listPrompts() {
        return [{ name: 'summarize' }];
      },
      async getPrompt() {
        return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'summarize this' } }] };
      },
      async listTools() {
        return [{ name: 'linker', inputSchema: { type: 'object', properties: {} } }];
      },
      /**
       * A non-textual content block, which must be handed to the client untouched by the output limit.
       */
      async callTool() {
        return { content: [{ type: 'resource_link' as const, uri: 'thing://1', name: 'The first thing' }] };
      },
    });
    api.addResource(mcp);

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });

    it('should advertise the capabilities of the extended surface', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' })
        .expect(200)
        .then(({ body: data }) => {
          data.result.capabilities.should.deep.equal({
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            prompts: { listChanged: false },
          });
        });
    });
    it('should serve the added methods', async function () {
      const { body: resources } = await jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'resources/list' }).expect(200);
      resources.result.resources.should.deep.equal([{ uri: 'thing://1', name: 'The first thing' }]);
      const { body: prompts } = await jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 2, method: 'prompts/list' }).expect(200);
      prompts.result.prompts.should.deep.equal([{ name: 'summarize' }]);
    });
    it('should leave the response alone if the method wrote it itself', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'stream' })
        .expect(200)
        .expect('Content-Type', /event-stream/)
        .then(({ text }) => {
          text.should.equal('data: hello\n\n');
        });
    });
    it('should pass a non textual content block through untouched', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'linker' } })
        .expect(200)
        .then(({ body: data }) => {
          data.result.content.should.deep.equal([{ type: 'resource_link', uri: 'thing://1', name: 'The first thing' }]);
        });
    });
  });

  describe('provider failures', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    const api = new API();
    const mcp = new MCPResource({ bundles: { default: {}, other: {} } });
    // listing only: tools/call must skip it rather than assume it can serve the tools it advertises
    mcp.addProvider('default', {
      async listTools(req: APIRequest) {
        if (req.headers['x-break']) {
          throw new Error('provider is down');
        }
        return [];
      },
    });
    mcp.addProvider('default', {
      async listTools() {
        return [
          { name: 'restful', inputSchema: { type: 'object', properties: {} } },
          { name: 'speechless', inputSchema: { type: 'object', properties: {} } },
        ];
      },
      async callTool(name: string) {
        if (name === 'speechless') {
          API.fireError(409);
        }
        API.fireError(409, 'conflict', { name });
      },
    });
    api.addResource(mcp);

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });

    it('should report a RESTError thrown by a provider, keeping its message and info', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'restful' } })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32603);
          data.error.message.should.equal('conflict');
          data.error.data.should.deep.equal({ name: 'restful' });
        });
    });
    it('should fall back to a generic message for a RESTError carrying none', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'speechless' } })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32603);
          data.error.message.should.equal('error');
        });
    });
    it('should report a failing catalogue as a plain HTTP error', function () {
      return request
        .get('/mcp')
        .set('x-break', '1')
        .expect(500)
        .then(({ body: data }) => {
          data.error.should.equal(500);
        });
    });
    it('should report a tool of a bundle with no providers as unknown', function () {
      return jsonrpc(request, '/mcp/other', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'restful' } })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32602);
          data.error.message.should.match(/Unknown tool restful/);
        });
    });
  });

  describe('a tool called without a path argument', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    const api = new API();
    api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
    api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/:id': { get: ReadOp as any } }));
    api.addResource(new MCPResource());

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });

    /**
     * The path parameter is `required` in the generated input schema, but a model can always ignore that,
     * and the placeholder must not end up in the url as the string "undefined".
     */
    it('should leave the path segment empty rather than interpolate undefined', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'thing_read', arguments: {} } })
        .expect(200)
        .then(({ body: data }) => {
          data.result.isError.should.be.true;
          data.result.content[0].text.should.match(/status 404/);
          data.result.content[0].text.should.not.match(/undefined/);
        });
    });
  });

  describe('a provider reached for a tool it does not expose', function () {
    /**
     * ResourceToolProvider.callTool re-resolves the tool through the very same filter listTools uses, so a
     * tool that vanished between the two - because the caller's privileges were revoked in between, or
     * because a caller reached the provider directly - is refused rather than served unchecked.
     */
    it('should refuse the call', async function () {
      const api = new API();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/:id': { get: ReadOp as any } }));
      const mcp = new MCPResource();
      api.addResource(mcp);
      await api.router();
      const provider: any = mcp.getProviders('default')[0];
      const req: any = { logger: console, scopes: new Scopes('*') };
      (await provider.listTools(req)).map((t) => t.name).should.deep.equal(['thing_read']);
      return provider.callTool('thing_nope', {}, req).should.be.rejectedWith(/Unknown tool thing_nope/);
    });
  });

  describe('tool ownership', function () {
    const req: any = { logger: console, scopes: new Scopes('*') };

    it('should ask a provider that implements hasTool, without listing its tools', async function () {
      let listed = 0;
      const provider = {
        async listTools() {
          listed++;
          return [{ name: 'a', inputSchema: {} }];
        },
        async hasTool(name: string) {
          return name === 'a';
        },
      };
      (await providerHasTool(provider, 'a', req)).should.be.true;
      (await providerHasTool(provider, 'b', req)).should.be.false;
      listed.should.equal(0);
    });
    it('should fall back to the tool list of a provider that does not', async function () {
      const provider = {
        async listTools() {
          return [{ name: 'a', inputSchema: {} }];
        },
      };
      (await providerHasTool(provider, 'a', req)).should.be.true;
      (await providerHasTool(provider, 'b', req)).should.be.false;
    });
    it('should report no tool for a provider that serves none', async function () {
      (await providerHasTool({}, 'a', req)).should.be.false;
    });

    it('should decide ownership on a resource without building any schema', async function () {
      const api = new API();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/:id': { get: ReadOp as any } }));
      const mcp = new MCPResource();
      api.addResource(mcp);
      await api.router();
      const provider: any = mcp.getProviders('default')[0];
      (await provider.hasTool('thing_read', req)).should.be.true;
      (await provider.hasTool('thing_nope', req)).should.be.false;
    });
    it('should not own a tool of an operation the caller is not authorized to perform', async function () {
      class ScopedAPI extends API {
        initSecurity(r: APIRequest, _res: APIResponse, next) {
          r.scopes = new Scopes(['Thing.query']);
          next();
        }
      }
      const api = new ScopedAPI();
      api.document.components!.securitySchemes = { oauth2: { type: 'oauth2', flows: { password: { tokenUrl: 'token', scopes: {} } } } };
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      api.addResource(new Resource({ name: 'Thing', mcp: true }, { '/': { get: QueryOp as any }, '/:id': { get: ReadOp as any } }));
      const mcp = new MCPResource();
      api.addResource(mcp);
      await api.router();
      const provider: any = mcp.getProviders('default')[0];
      const scoped: any = { logger: console, scopes: new Scopes(['Thing.query']) };
      (await provider.hasTool('thing_query', scoped)).should.be.true;
      (await provider.hasTool('thing_read', scoped)).should.be.false;
    });
  });

  describe('a provider configured explicitly rather than by its resource', function () {
    const req: any = { logger: console, scopes: new Scopes('*') };

    /**
     * A resource built per request is not part of the API document, so its MCP configuration cannot come
     * from a static ResourceDefinition: it is passed to the provider instead.
     */
    async function provide(info: any, options?: any): Promise<any> {
      const api = new API();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      const resource = new Resource(info, { '/': { get: QueryOp as any }, '/:id': { get: ReadOp as any, delete: RemoveOp as any } });
      api.addResource(resource);
      api.addResource(new MCPResource());
      await api.router();
      return new ResourceToolProvider(resource, 'default', {}, options);
    }

    it('should take its options from the resource when none are passed', async function () {
      const provider = await provide({ name: 'Thing', mcp: { operations: ['query'] } });
      (await provider.listTools(req)).map((t) => t.name).should.deep.equal(['thing_query']);
    });
    it('should take no options from a resource opted in with the true shorthand', async function () {
      const provider = await provide({ name: 'Thing', mcp: true });
      (await provider.listTools(req)).map((t) => t.name).should.deep.equal(['thing_query', 'thing_read', 'thing_remove']);
    });
    it('should ignore the resource options when its own are passed', async function () {
      const provider = await provide({ name: 'Thing', mcp: { operations: ['query'] } }, { operations: ['read'] });
      (await provider.listTools(req)).map((t) => t.name).should.deep.equal(['thing_read']);
    });
    it('should serve a resource that never opted in at all', async function () {
      const provider = await provide({ name: 'Thing' }, { operations: ['read'] });
      (await provider.listTools(req)).map((t) => t.name).should.deep.equal(['thing_read']);
    });
    it('should replace the resource name in the generated tool names', async function () {
      const provider = await provide({ name: 'Thing' }, { toolNamePrefix: 'custom_pkg_model', operations: ['query', 'read'] });
      (await provider.listTools(req)).map((t) => t.name).should.deep.equal(['custom_pkg_model_query', 'custom_pkg_model_read']);
      (await provider.hasTool('custom_pkg_model_read', req)).should.be.true;
      (await provider.hasTool('thing_read', req)).should.be.false;
    });
    it('should leave an explicitly named tool alone', async function () {
      const provider = await provide({ name: 'Thing' }, { toolNamePrefix: 'custom_pkg_model', tools: { read: { name: 'read_it' } }, operations: ['read'] });
      (await provider.listTools(req)).map((t) => t.name).should.deep.equal(['read_it']);
    });
  });

  describe('a dynamic provider', function () {
    const request = supertest(basePath);
    const app = express();
    let server;

    /**
     * Two resources built on their own API, as a per-request provider does for resources that are created
     * from data - one per tenant, per data model, per plugin - and are therefore unknown to MCPResource.
     */
    async function build(name: string, prefix: string, bundleId: string): Promise<ResourceToolProvider> {
      const api = new API();
      api.registerSchema('thing', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } as any);
      const resource = new Resource({ name }, { '/': { get: QueryOp as any }, '/:id': { get: ReadOp as any } });
      api.addResource(resource);
      await api.router();
      return new ResourceToolProvider(resource, bundleId, {}, { bundles: [bundleId], toolNamePrefix: prefix });
    }

    let built: string[] = [];
    class Dynamic extends DynamicToolProvider {
      constructor(protected bundleId: string = 'default') {
        super();
      }
      protected async getProviders(): Promise<any[]> {
        built.push('all');
        return [
          await build('One', 'one', this.bundleId),
          await build('Two', 'two', this.bundleId),
          { async listTools() { return [{ name: 'extra', inputSchema: {} }]; } },
          {},
        ];
      }
    }
    /**
     * The shape a real implementation takes: the tool name says which resource serves it, so a call builds
     * that one only.
     */
    class Targeted extends Dynamic {
      protected async findProvider(name: string): Promise<any> {
        const match = /^(one|two)_/.exec(name);
        if (!match) {
          return undefined;
        }
        built.push(match[1]);
        return build(match[1] === 'one' ? 'One' : 'Two', match[1], this.bundleId);
      }
    }

    const api = new API();
    const mcp = new MCPResource({ bundles: { default: {}, targeted: {} } });
    mcp.addProvider('default', new Dynamic());
    mcp.addProvider('targeted', new Targeted('targeted'));
    api.addResource(mcp);

    before(async function () {
      app.use(await api.router());
      server = app.listen(port);
    });
    after(function () {
      server.close();
    });
    beforeEach(function () {
      built = [];
    });

    it('should list the tools of every provider it serves', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
        .expect(200)
        .then(({ body: data }) => {
          data.result.tools.map((t) => t.name).should.deep.equal(['one_query', 'one_read', 'two_query', 'two_read', 'extra']);
        });
    });
    it('should advertise the tools capability', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' })
        .expect(200)
        .then(({ body: data }) => {
          data.result.capabilities.should.deep.equal({ tools: { listChanged: false } });
        });
    });
    it('should route a call to the provider serving the tool', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'two_read', arguments: { id: 'abc' } } })
        .expect(200)
        .then(({ body: data }) => {
          should.not.exist(data.error);
          data.result.structuredContent.should.deep.equal({ id: 'abc', a: 'x' });
        });
    });
    it('should refuse a call to a tool none of its providers serves', function () {
      return jsonrpc(request, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'three_read' } })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32602);
          data.error.message.should.match(/Unknown tool three_read/);
        });
    });
    it('should resolve the provider of a tool once per request', function () {
      return jsonrpc(request, '/mcp/targeted', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'one_read', arguments: { id: 'abc' } } })
        .expect(200)
        .then(({ body: data }) => {
          should.not.exist(data.error);
          data.result.structuredContent.should.deep.equal({ id: 'abc', a: 'x' });
          // hasTool, then callTool: one resolution, and no enumeration of the providers of the other models
          built.should.deep.equal(['one']);
        });
    });
    it('should not enumerate its providers to refuse an unknown tool', function () {
      return jsonrpc(request, '/mcp/targeted', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'three_read' } })
        .expect(200)
        .then(({ body: data }) => {
          data.error.code.should.equal(-32602);
          built.should.deep.equal([]);
        });
    });
    it('should still list the tools of every provider when calls are targeted', function () {
      return jsonrpc(request, '/mcp/targeted', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
        .expect(200)
        .then(({ body: data }) => {
          data.result.tools.map((t) => t.name).should.deep.equal(['one_query', 'one_read', 'two_query', 'two_read', 'extra']);
          built.should.deep.equal(['all']);
        });
    });
    it('should refuse a call reaching it directly for a tool it does not serve', async function () {
      const provider: any = new Dynamic();
      const req: any = { logger: console, scopes: new Scopes('*') };
      (await provider.hasTool('one_read', req)).should.be.true;
      (await provider.hasTool('nope', req)).should.be.false;
      await provider.callTool('nope', {}, req).should.be.rejectedWith(/Unknown tool nope/);
    });
  });
});
