import * as chai from 'chai';
import {
  annotationsFor,
  MCP_BODY_ARGUMENT,
  operationParameters,
  operationRequestBody,
  operationResponseSchema,
  operationToInputSchema,
  operationToOutputSchema,
  resolveComponentRef,
  toolNameFor,
} from '../../dist/mcp/schema.js';

const should = chai.should();

describe('mcp schema', function () {
  const doc: any = {
    openapi: '3.1.0',
    info: { title: 'test', version: '1.0.0' },
    paths: {},
    components: {
      parameters: {
        limit: { name: 'limit', in: 'query', description: 'How many', schema: { type: 'integer' } },
        id: { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        session: { name: 'x-session', in: 'header', schema: { type: 'string' } },
        cookied: { name: 'sid', in: 'cookie', schema: { type: 'string' } },
        nameless: { in: 'query', schema: { type: 'string' } },
      },
      schemas: {
        node: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            parent: { $ref: '#/components/schemas/node' },
            tags: { type: 'array', items: { type: 'string' }, enum: undefined },
          },
        },
        tree: {
          type: 'object',
          properties: {
            children: { type: 'array', items: { $ref: '#/components/schemas/tree' } },
            kind: { type: 'string', enum: ['a', 'b'] },
          },
        },
        list: {
          type: 'array',
          items: { $ref: '#/components/schemas/node' },
        },
      },
      requestBodies: {
        nodeBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/node' } } },
        },
      },
      responses: {
        nodeResponse: {
          description: 'a node',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/node' } } },
        },
      },
    },
  };

  describe('toolNameFor', function () {
    it('should decamelize and join the resource name and the operation id', function () {
      toolNameFor('Order', 'query').should.equal('order_query');
      toolNameFor('CustomerAccount', 'readById').should.equal('customer_account_read_by_id');
    });
    it('should replace invalid characters', function () {
      toolNameFor('My Resource!', 'do/it').should.equal('my_resource_do_it');
    });
    it('should trim leading and trailing underscores', function () {
      toolNameFor('!!a!!', '!!b!!').should.equal('a_b');
    });
    it('should fall back to a generic name if nothing survives sanitization', function () {
      toolNameFor('!!!', '???').should.equal('tool');
    });
    it('should truncate to 128 characters', function () {
      const name = toolNameFor('a'.repeat(200), 'query');
      name.length.should.equal(128);
    });
    it('should match the name pattern required by MCP', function () {
      /^[a-zA-Z0-9_-]{1,128}$/.test(toolNameFor('Òrder #1', 'query')).should.be.true;
    });
  });

  describe('annotationsFor', function () {
    it('should mark get as read only and idempotent', function () {
      annotationsFor('get').should.deep.equal({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    });
    it('should mark head and options as read only and idempotent', function () {
      annotationsFor('head').readOnlyHint!.should.be.true;
      annotationsFor('options').idempotentHint!.should.be.true;
    });
    it('should mark delete as destructive and idempotent', function () {
      annotationsFor('delete').should.deep.equal({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
    });
    it('should mark put as idempotent', function () {
      annotationsFor('put').should.deep.equal({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    });
    it('should mark post and patch as neither read only nor idempotent', function () {
      annotationsFor('post').should.deep.equal({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
      annotationsFor('patch').idempotentHint!.should.be.false;
    });
  });

  describe('resolveComponentRef', function () {
    it('should resolve a local component reference', function () {
      resolveComponentRef<any>(doc, '#/components/parameters/limit').name.should.equal('limit');
    });
    it('should return undefined without a document', function () {
      should.not.exist(resolveComponentRef(undefined, '#/components/parameters/limit'));
    });
    it('should return undefined if the document has no components', function () {
      should.not.exist(resolveComponentRef({ openapi: '3.1.0' } as any, '#/components/parameters/limit'));
    });
    it('should return undefined for a non component reference', function () {
      should.not.exist(resolveComponentRef(doc, 'http://example.com/schema'));
      should.not.exist(resolveComponentRef(doc, '#/paths/~1a/get'));
    });
    it('should return undefined for an unknown section', function () {
      should.not.exist(resolveComponentRef(doc, '#/components/aliens/limit'));
    });
    it('should return undefined for an unknown component', function () {
      should.not.exist(resolveComponentRef(doc, '#/components/parameters/nope'));
    });
  });

  describe('operationParameters', function () {
    it('should return an empty array if the operation has no parameters', function () {
      operationParameters({ responses: {} } as any, doc).should.deep.equal([]);
    });
    it('should resolve referenced parameters', function () {
      const out = operationParameters({ parameters: [{ $ref: '#/components/parameters/limit' }], responses: {} } as any, doc);
      out.length.should.equal(1);
      out[0].name.should.equal('limit');
    });
    it('should keep inline parameters', function () {
      const out = operationParameters({ parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }], responses: {} } as any, doc);
      out[0].name.should.equal('q');
    });
    it('should skip unresolvable references', function () {
      operationParameters({ parameters: [{ $ref: '#/components/parameters/nope' }], responses: {} } as any, doc).should.deep.equal([]);
    });
    it('should skip cookie parameters and nameless parameters', function () {
      operationParameters(
        { parameters: [{ $ref: '#/components/parameters/cookied' }, { $ref: '#/components/parameters/nameless' }], responses: {} } as any,
        doc
      ).should.deep.equal([]);
    });
  });

  describe('operationRequestBody', function () {
    it('should return undefined if there is no request body', function () {
      should.not.exist(operationRequestBody({ responses: {} } as any, doc));
    });
    it('should return undefined if the request body has no content', function () {
      should.not.exist(operationRequestBody({ requestBody: { description: 'x' }, responses: {} } as any, doc));
    });
    it('should return undefined if the request body has no supported media type', function () {
      should.not.exist(operationRequestBody({ requestBody: { content: { 'text/csv': { schema: {} } } }, responses: {} } as any, doc));
    });
    it('should return undefined if the media type has no schema', function () {
      should.not.exist(operationRequestBody({ requestBody: { content: { 'application/json': {} } }, responses: {} } as any, doc));
    });
    it('should resolve a referenced request body', function () {
      const out = operationRequestBody({ requestBody: { $ref: '#/components/requestBodies/nodeBody' }, responses: {} } as any, doc);
      (out as any).required.should.be.true;
      (out as any).schema.$ref.should.equal('#/components/schemas/node');
    });
    it('should return undefined for an unresolvable referenced request body', function () {
      should.not.exist(operationRequestBody({ requestBody: { $ref: '#/components/requestBodies/nope' }, responses: {} } as any, doc));
    });
    it('should support urlencoded bodies and default required to false', function () {
      const out = operationRequestBody(
        { requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object' } } } }, responses: {} } as any,
        doc
      );
      (out as any).required.should.be.false;
    });
  });

  describe('operationResponseSchema', function () {
    it('should return undefined if the operation declares no responses', function () {
      should.not.exist(operationResponseSchema({} as any, doc));
    });
    it('should return undefined if there is no 2xx response', function () {
      should.not.exist(operationResponseSchema({ responses: { '400': { description: 'ko' } } } as any, doc));
    });
    it('should return the schema of the first 2xx response', function () {
      const out = operationResponseSchema(
        { responses: { '201': { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } } } as any,
        doc
      );
      out.type.should.equal('object');
    });
    it('should resolve a referenced response', function () {
      operationResponseSchema({ responses: { '200': { $ref: '#/components/responses/nodeResponse' } } } as any, doc).$ref.should.equal(
        '#/components/schemas/node'
      );
    });
    it('should return undefined for an unresolvable referenced response', function () {
      should.not.exist(operationResponseSchema({ responses: { '200': { $ref: '#/components/responses/nope' } } } as any, doc));
    });
    it('should return undefined if the response has no json content', function () {
      should.not.exist(operationResponseSchema({ responses: { '204': { description: 'no content' } } } as any, doc));
    });
  });

  describe('operationToInputSchema', function () {
    it('should return an empty object schema for an operation with no inputs', function () {
      operationToInputSchema({ responses: {} } as any, doc).should.deep.equal({ type: 'object', properties: {} });
    });
    it('should turn parameters into properties, carrying over the description', function () {
      const schema = operationToInputSchema({ parameters: [{ $ref: '#/components/parameters/limit' }], responses: {} } as any, doc);
      schema.should.deep.equal({
        type: 'object',
        properties: { limit: { type: 'integer', description: 'How many' } },
      });
    });
    it('should not overwrite a description already present in the parameter schema', function () {
      const schema = operationToInputSchema(
        { parameters: [{ name: 'a', in: 'query', description: 'outer', schema: { type: 'string', description: 'inner' } }], responses: {} } as any,
        doc
      );
      schema.properties.a.description.should.equal('inner');
    });
    it('should use an empty schema for a parameter without one', function () {
      const schema = operationToInputSchema({ parameters: [{ name: 'a', in: 'query' }], responses: {} } as any, doc);
      schema.properties.a.should.deep.equal({});
    });
    it('should always mark path parameters as required', function () {
      const schema = operationToInputSchema({ parameters: [{ name: 'a', in: 'path', schema: { type: 'string' } }], responses: {} } as any, doc);
      schema.required.should.deep.equal(['a']);
    });
    it('should mark explicitly required parameters as required', function () {
      const schema = operationToInputSchema(
        { parameters: [{ name: 'a', in: 'query', required: true, schema: { type: 'string' } }], responses: {} } as any,
        doc
      );
      schema.required.should.deep.equal(['a']);
    });
    it('should omit the requested parameters', function () {
      const schema = operationToInputSchema(
        { parameters: [{ $ref: '#/components/parameters/limit' }, { $ref: '#/components/parameters/session' }], responses: {} } as any,
        doc,
        ['x-session']
      );
      Object.keys(schema.properties).should.deep.equal(['limit']);
    });
    it('should turn the request body into the body property', function () {
      const schema = operationToInputSchema(
        { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: {} } as any,
        doc
      );
      schema.properties[MCP_BODY_ARGUMENT].should.deep.equal({ description: 'Body of the request', type: 'object' });
      schema.required.should.deep.equal([MCP_BODY_ARGUMENT]);
    });
    it('should not mark an optional body as required', function () {
      const schema = operationToInputSchema({ requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: {} } as any, doc);
      should.not.exist(schema.required);
    });
    it('should be able to omit the body', function () {
      const schema = operationToInputSchema(
        { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: {} } as any,
        doc,
        [MCP_BODY_ARGUMENT]
      );
      schema.properties.should.deep.equal({});
    });
    it('should leave a boolean body schema alone', function () {
      const schema = operationToInputSchema({ requestBody: { content: { 'application/json': { schema: true } } }, responses: {} } as any, doc);
      schema.properties[MCP_BODY_ARGUMENT].should.equal(true);
    });

    describe('$defs bundling', function () {
      it('should bundle a self recursive schema', function () {
        const schema = operationToInputSchema(
          { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/node' } } } }, responses: {} } as any,
          doc
        );
        schema.properties.body.$ref.should.equal('#/$defs/node');
        schema.$defs.node.properties.parent.$ref.should.equal('#/$defs/node');
        schema.$defs.node.properties.name.type.should.equal('string');
      });
      it('should bundle a schema recursive through items', function () {
        const schema = operationToInputSchema(
          { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/tree' } } } }, responses: {} } as any,
          doc
        );
        schema.$defs.tree.properties.children.items.$ref.should.equal('#/$defs/tree');
        schema.$defs.tree.properties.kind.enum.should.deep.equal(['a', 'b']);
      });
      it('should bundle a schema referenced from inside an array schema', function () {
        const schema = operationToInputSchema(
          { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/list' } } } }, responses: {} } as any,
          doc
        );
        schema.$defs.list.items.$ref.should.equal('#/$defs/node');
        should.exist(schema.$defs.node);
      });
      it('should bundle the same schema only once', function () {
        const schema = operationToInputSchema(
          {
            parameters: [{ name: 'a', in: 'query', schema: { $ref: '#/components/schemas/node' } }],
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/node' } } } },
            responses: {},
          } as any,
          doc
        );
        Object.keys(schema.$defs).should.deep.equal(['node']);
      });
      it('should leave a non component reference alone', function () {
        const schema = operationToInputSchema(
          { parameters: [{ name: 'a', in: 'query', schema: { $ref: 'http://example.com/s#' } }], responses: {} } as any,
          doc
        );
        schema.properties.a.$ref.should.equal('http://example.com/s#');
        should.not.exist(schema.$defs);
      });
      it('should leave a reference to a non schema component alone', function () {
        const schema = operationToInputSchema(
          { parameters: [{ name: 'a', in: 'query', schema: { $ref: '#/components/parameters/limit' } }], responses: {} } as any,
          doc
        );
        schema.properties.a.$ref.should.equal('#/components/parameters/limit');
        should.not.exist(schema.$defs);
      });
      it('should bundle an unresolvable schema reference as an empty schema', function () {
        const schema = operationToInputSchema(
          { parameters: [{ name: 'a', in: 'query', schema: { $ref: '#/components/schemas/nope' } }], responses: {} } as any,
          doc
        );
        schema.properties.a.$ref.should.equal('#/$defs/nope');
        schema.$defs.nope.should.deep.equal({});
      });
      it('should preserve non object schema values', function () {
        const schema = operationToInputSchema(
          {
            parameters: [
              { name: 'a', in: 'query', schema: { type: 'string', const: 'x', default: 'x', examples: ['x'], nullable: null, oneOf: [{ type: 'string' }] } },
            ],
            responses: {},
          } as any,
          doc
        );
        schema.properties.a.should.deep.equal({
          type: 'string',
          const: 'x',
          default: 'x',
          examples: ['x'],
          nullable: null,
          oneOf: [{ type: 'string' }],
        });
      });
      it('should work without a document', function () {
        const schema = operationToInputSchema({ parameters: [{ name: 'a', in: 'query', schema: { $ref: '#/components/schemas/node' } }], responses: {} } as any);
        schema.$defs.node.should.deep.equal({});
      });
    });
  });

  describe('operationToOutputSchema', function () {
    it('should return undefined if there is no response schema', function () {
      should.not.exist(operationToOutputSchema({ responses: {} } as any, doc));
    });
    it('should return undefined for a boolean response schema', function () {
      should.not.exist(operationToOutputSchema({ responses: { '200': { description: 'ok', content: { 'application/json': { schema: true } } } } } as any, doc));
    });
    it('should return undefined for an array response schema', function () {
      should.not.exist(
        operationToOutputSchema(
          { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: {} } } } } } } as any,
          doc
        )
      );
    });
    it('should return undefined for a referenced array response schema', function () {
      should.not.exist(
        operationToOutputSchema(
          { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/list' } } } } } } as any,
          doc
        )
      );
    });
    it('should return undefined for an unresolvable referenced response schema', function () {
      should.not.exist(
        operationToOutputSchema(
          { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/nope' } } } } } } as any,
          doc
        )
      );
    });
    it('should return an inline object schema as is', function () {
      operationToOutputSchema(
        {
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { a: { type: 'string' } } } } } } },
        } as any,
        doc
      ).should.deep.equal({ type: 'object', properties: { a: { type: 'string' } } });
    });
    it('should wrap a referenced object schema, bundling it into $defs', function () {
      operationToOutputSchema(
        { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/node' } } } } } } as any,
        doc
      ).should.deep.equal({
        type: 'object',
        allOf: [{ $ref: '#/$defs/node' }],
        $defs: {
          node: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              parent: { $ref: '#/$defs/node' },
              tags: { type: 'array', items: { type: 'string' }, enum: undefined },
            },
          },
        },
      });
    });
    it('should bundle the references of an inline object schema', function () {
      const out = operationToOutputSchema(
        {
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { type: 'object', properties: { root: { $ref: '#/components/schemas/node' } } } } },
            },
          },
        } as any,
        doc
      );
      out.properties.root.$ref.should.equal('#/$defs/node');
      should.exist(out.$defs.node);
    });
  });
});
