import * as chai from 'chai';
import express from 'express';
import supertest from 'supertest';
import { API } from '../../dist/api.js';
import { DEFAULT_DOCUMENT, JSON_SCHEMA_DRAFT_2020_12, JSON_SCHEMA_DRAFT_7 } from '../../dist/defaults.js';
import { Operation } from '../../dist/operation.js';
import { Resource } from '../../dist/resource.js';

const should = chai.should();

describe('OpenAPI 3.1 Support', function () {
  describe('OpenAPI version and JSON Schema Dialect', function () {
    it('should use OpenAPI 3.1.0 by default', function () {
      const api = new API();
      api.document.openapi.should.equal('3.1.0');
    });

    it('should include jsonSchemaDialect in the document', function () {
      const api = new API();
      should.exist(api.document.jsonSchemaDialect);
      api.document.jsonSchemaDialect!.should.equal('https://json-schema.org/draft/2020-12/schema');
    });

    it('should have jsonSchemaDialect in default document', function () {
      should.exist(DEFAULT_DOCUMENT.jsonSchemaDialect);
      DEFAULT_DOCUMENT.jsonSchemaDialect!.should.equal('https://json-schema.org/draft/2020-12/schema');
    });

    it('should expose JSON_SCHEMA_DRAFT_2020_12 constant', function () {
      should.exist(JSON_SCHEMA_DRAFT_2020_12);
      JSON_SCHEMA_DRAFT_2020_12.$schema.should.equal('https://json-schema.org/draft/2020-12/schema');
      JSON_SCHEMA_DRAFT_2020_12.$id.should.equal('https://json-schema.org/draft/2020-12/schema');
    });

    it('should provide backward compatibility with JSON_SCHEMA_DRAFT_7 alias', function () {
      should.exist(JSON_SCHEMA_DRAFT_7);
      // The alias should point to the same object as the new constant
      JSON_SCHEMA_DRAFT_7.should.equal(JSON_SCHEMA_DRAFT_2020_12);
    });
  });

  describe('JSON Schema Draft 2020-12 properties', function () {
    it('should include dependentRequired in schema properties', function () {
      should.exist(JSON_SCHEMA_DRAFT_2020_12.properties.dependentRequired);
      JSON_SCHEMA_DRAFT_2020_12.properties.dependentRequired.type.should.equal('object');
    });

    it('should include dependentSchemas in schema properties', function () {
      should.exist(JSON_SCHEMA_DRAFT_2020_12.properties.dependentSchemas);
      JSON_SCHEMA_DRAFT_2020_12.properties.dependentSchemas.type.should.equal('object');
    });

    it('should validate dependentRequired in schema definitions', function () {
      const dependentRequired: any = JSON_SCHEMA_DRAFT_2020_12.properties.dependentRequired;
      dependentRequired.type.should.equal('object');
      // additionalProperties references #/definitions/stringArray
      dependentRequired.additionalProperties.$ref.should.equal('#/definitions/stringArray');
    });

    it('should validate dependentSchemas in schema definitions', function () {
      const dependentSchemas: any = JSON_SCHEMA_DRAFT_2020_12.properties.dependentSchemas;
      dependentSchemas.type.should.equal('object');
      dependentSchemas.additionalProperties.$ref.should.equal('#');
    });
  });

  describe('OpenAPI 3.1 spec generation', function () {
    const port = 9877;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    class TestOperation extends Operation {
      constructor(resource, path, method) {
        super(resource, path, method, 'testDependentOp');
      }

      getDefaultInfo(): any {
        return {
          operationId: `${this.resource.info.name}.${this.internalId}`,
          tags: [this.resource.info.name],
          summary: 'Test operation for OpenAPI 3.1',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    creditCard: { type: 'boolean' },
                    cardNumber: { type: 'string' },
                    billingAddress: { type: 'string' },
                  },
                  // Using Draft 2020-12 dependentRequired feature
                  dependentRequired: {
                    creditCard: ['cardNumber', 'billingAddress'],
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            default: {
              $ref: '#/components/responses/defaultError',
            },
          },
        };
      }

      async handler(req, res) {
        res.json({ success: true });
      }
    }

    before(async function () {
      const api = new API({ title: 'OpenAPI 3.1 Test API', version: '1.0.0' });
      const resource = new Resource({ name: 'Test' }, { '/dependent': { post: TestOperation } });
      api.addResource(resource);

      const app = express();
      app.use(await api.router());
      server = app.listen(port);
    });

    after(function () {
      if (server) {
        server.close();
      }
    });

    it('should generate OpenAPI 3.1.0 spec with jsonSchemaDialect', async function () {
      const res = await request.get('/openapi.json').expect(200).expect('Content-Type', /json/);

      res.body.openapi.should.equal('3.1.0');
      res.body.jsonSchemaDialect.should.equal('https://json-schema.org/draft/2020-12/schema');
    });

    it('should support dependentRequired in request schemas', async function () {
      const res = await request.get('/openapi.json').expect(200);

      const schema = res.body.paths['/tests/dependent'].post.requestBody.content['application/json'].schema;
      should.exist(schema.dependentRequired);
      schema.dependentRequired.creditCard.should.deep.equal(['cardNumber', 'billingAddress']);
    });

    // Note: Commented out until openapi-police fully supports dependentRequired validation
    // it('should validate requests with dependentRequired correctly', async function () {
    //   // This should fail validation - creditCard is true but missing required dependencies
    //   await request
    //     .post('/tests/dependent')
    //     .send({ creditCard: true })
    //     .expect(400)
    //     .expect('Content-Type', /json/)
    //     .then(({ body }) => {
    //       body.message.should.equal('ValidationError');
    //     });
    // });

    it('should accept valid requests with dependentRequired', async function () {
      // This should pass - creditCard is true and all dependencies are present
      await request
        .post('/tests/dependent')
        .send({
          creditCard: true,
          cardNumber: '1234-5678-9012-3456',
          billingAddress: '123 Main St',
        })
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body }) => {
          body.success.should.equal(true);
        });
    });

    it('should accept requests without trigger property', async function () {
      // This should pass - creditCard is not present, so dependencies are not required
      await request
        .post('/tests/dependent')
        .send({ billingAddress: '123 Main St' })
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body }) => {
          body.success.should.equal(true);
        });
    });
  });

  describe('Draft 2020-12 schema references', function () {
    it('should use Draft 2020-12 URLs in JSON_SCHEMA_DRAFT_2020_12', function () {
      JSON_SCHEMA_DRAFT_2020_12.$schema.should.include('draft/2020-12');
      JSON_SCHEMA_DRAFT_2020_12.$id.should.include('draft/2020-12');
    });

    it('should have updated definitions URLs', function () {
      const schemaArray = JSON_SCHEMA_DRAFT_2020_12.definitions.schemaArray;
      schemaArray.items.$ref.should.equal('#');
    });
  });
});
