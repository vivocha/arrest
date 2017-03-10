var chai = require('chai')
  , spies = require('chai-spies')
  , should = chai.should()
  , API = require('../dist/api').API
  , Resource = require('../dist/resource').Resource
  , Operation = require('../dist/operation').Operation


chai.use(spies);

describe('Resource', function() {

  describe('constructor', function() {

    it('should create a Resource with specified metadata', function() {
      const meta = {
        name: 'Test',
        description: 'Test description',
        namePlural: 'Testi',
        id: 'ID',
        title: 'Test title',
        summaryFields: [ 'a', 'b' ]
      };
      let r = new Resource(meta);
      r.name.should.equal(meta.name);
      r.description.should.equal(meta.description);
      r.namePlural.should.equal(meta.namePlural);
      r.id.should.equal(meta.id);
      r.title.should.equal(meta.title);
      r.summaryFields.should.equal(meta.summaryFields);
    });

    it('should set namePlural when not specified', function() {
      let r = new Resource({ name: 'Test' });
      r.namePlural.should.equal('Tests');
    });

    it('should instantiate the operations specified in the routes', function() {
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super('aaa', resource, path, method);
        }
      }
      let r = new Resource({ name: 'Test' }, { '/': { get: TestOp }});
      r.operations.should.have.length(1);
      r.operations[0].should.be.instanceOf(TestOp);
      r.operations[0].operationId.should.be.equal('Test.aaa');
    });

  });

  describe('basePath', function() {

    it('should return the correct base path', function() {
      let r = new Resource({ name: 'Test' });
      r.basePath.should.equal('/tests');
    });

  });

  describe('scopeDescription', function() {

    it('should return the correct scope description', function() {
      let r = new Resource({ name: 'Test' });
      r.scopeDescription.should.equal('Unrestricted access to all Tests');
    });

  });

  describe('attach', function() {

    it('should add a tag to the API and add the scope description to oauth2 settings', function() {
      const api = new API({
        info: {
          version: '1.0.0'
        },
        securityDefinitions: {
          "access_code": {
            "type": "oauth2",
            "flow": "accessCode",
            "tokenUrl": "token"
          },
          "implicit": {
            "type": "oauth2",
            "flow": "implicit",
            "authorizationUrl": "/a/b/authorize",
            "scopes": {}
          }
        }
      });
      const meta = {
        name: 'Test',
        description: 'Test description',
        id: 'ID',
        title: 'Test title',
        summaryFields: [ 'a', 'b' ],
        externalDocs: { url: 'aaaa' }
      };
      let r = new Resource(meta);
      api.addResource(r);
      api.tags.should.have.length(1);
      let t = api.tags[0];
      t.name.should.equal(meta.name);
      t.description.should.equal(meta.description);
      t.externalDocs.should.deep.equal(meta.externalDocs);
      t['x-id'].should.equal(meta.id);
      t['x-title'].should.equal(meta.title);
      t['x-summary-fields'].should.equal(meta.summaryFields);
      api.securityDefinitions.access_code.scopes[meta.name].should.equal(r.scopeDescription);
      api.securityDefinitions.implicit.scopes[meta.name].should.equal(r.scopeDescription);
    });

    it('should also attach all operations', function() {
      const api = new API({ info: { version: '1.0.0' }});
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super('aaa', resource, path, method);
        }
      }
      let r1 = new Resource({ name: 'Test' }, { '/': { get: TestOp }});
      let r2 = new Resource({ name: 'Other' }, { '/': { post: TestOp }});
      api.addResource(r1);
      api.addResource(r2);
      should.exist(api.paths['/tests/']);
      should.exist(api.paths['/tests/'].get);
      api.paths['/tests/'].get.operationId.should.equal('Test.aaa');
      should.exist(api.paths['/others/']);
      should.exist(api.paths['/others/'].post);
      api.paths['/others/'].post.operationId.should.equal('Other.aaa');
    });

  });

});
