var chai = require('chai')
  , spies = require('chai-spies')
  , should = chai.should()
  , API = require('../dist/api').API
  , Resource = require('../dist/resource').Resource
  , ops = require('../dist/operation')
  , Operation = ops.Operation
  , SimpleOperation = ops.SimpleOperation


chai.use(spies);

describe('Resource', function() {

  describe('constructor', function () {

    it('should create a Resource with no metadata', function () {
      let r = new Resource();
      r.name.should.equal('Resource');
    });

    it('should create a Resource with specified metadata', function () {
      const meta = {
        name: 'Test',
        description: 'Test description',
        namePlural: 'Testi',
        id: 'ID',
        title: 'Test title',
        summaryFields: ['a', 'b']
      };
      let r = new Resource(meta);
      r.name.should.equal(meta.name);
      r.description.should.equal(meta.description);
      r.namePlural.should.equal(meta.namePlural);
      r.id.should.equal(meta.id);
      r.title.should.equal(meta.title);
      r.summaryFields.should.equal(meta.summaryFields);
    });

    it('should set namePlural when not specified', function () {
      let r = new Resource({name: 'Test'});
      r.namePlural.should.equal('Tests');
    });

    it('should instantiate the operations specified in the routes, with the routes property', function () {
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super('aaa', resource, path, method);
        }
      }
      let r = new Resource({name: 'Test', routes: {'/': {get: TestOp}}});
      r.operations.should.have.length(1);
      r.operations[0].should.be.instanceOf(TestOp);
      r.operations[0].operationId.should.be.equal('Test.aaa');
    });

    it('should instantiate the operations specified in the routes, with the routes argument', function () {
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super('aaa', resource, path, method);
        }
      }
      let r = new Resource({name: 'Test'}, {'/': {get: TestOp}});
      r.operations.should.have.length(1);
      r.operations[0].should.be.instanceOf(TestOp);
      r.operations[0].operationId.should.be.equal('Test.aaa');
    });

    it('should instantiate the operations specified by request handler', function () {
      let r = new Resource({name: 'Test'}, {
        '/': {
          get: (req, res) => {
          }
        }
      });
      r.operations.should.have.length(1);
      r.operations[0].should.be.instanceOf(SimpleOperation);
      r.operations[0].operationId.should.be.equal('Test.get');
    });

    it('should throw if routes are specified twice', function () {
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super('aaa', resource, path, method);
        }
      }
      should.throw(function () {
        new Resource({name: 'Test', routes: {}}, {'/': {get: TestOp}})
      }, Error, /double/);
    });

    it('should throw if an invalid route handler is specified', function () {
      should.throw(function () {
        new Resource({name: 'Test'}, {'/': {get: null}})
      }, Error, /invalid handler/);
    });

  });

  describe('basePath', function () {

    it('should return the correct base path', function () {
      let r1 = new Resource({name: 'Test'});
      r1.basePath.should.equal('/tests');
      let r2 = new Resource({name: 'MyTest'});
      r2.basePath.should.equal('/my-tests');
      let r3 = new Resource({name: 'Test', path: 'my-path' });
      r3.basePath.should.equal('/my-path');
    });

  });

  describe('scopeDescription', function () {

    it('should return the correct scope description', function () {
      let r = new Resource({name: 'Test'});
      r.scopeDescription.should.equal('Unrestricted access to all Tests');
    });

  });

  describe('attach', function () {

    it('should add a tag to the API and add the scope description to oauth2 settings', function () {
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
        summaryFields: ['a', 'b'],
        externalDocs: {url: 'aaaa'}
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

    it('should also attach all operations', function () {
      const api = new API({info: {version: '1.0.0'}});
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super('aaa', resource, path, method);
        }
      }
      let r1 = new Resource({name: 'Test'}, {'/': {get: TestOp}});
      let r2 = new Resource({name: 'Other'}, {'/': {post: TestOp}});
      api.addResource(r1);
      api.addResource(r2);
      should.exist(api.paths['/tests']);
      should.exist(api.paths['/tests'].get);
      api.paths['/tests'].get.operationId.should.equal('Test.aaa');
      should.exist(api.paths['/others']);
      should.exist(api.paths['/others'].post);
      api.paths['/others'].post.operationId.should.equal('Other.aaa');
    });

  });

  describe('addOperation', function () {

    it('should add an Operation instance', function () {

      class TestOp extends Operation {
        constructor(resource, path, method) {
          super('aaa', resource, path, method);
        }
      }
      let r = new Resource();
      r.addOperation(new TestOp(r, '/', 'get'));
      r.operations.should.have.length(1);
      r.operations[0].should.be.instanceOf(TestOp);
      r.operations[0].operationId.should.be.equal('Resource.aaa');
    });

    it('should add a SimpleOperation instance and assign it a default id', function () {
      let r = new Resource();
      r.addOperation('/', 'get', (req, res) => {});
      r.addOperation('', 'get', (req, res) => {});
      r.addOperation('/a', 'get', (req, res) => {});
      r.addOperation('/a', 'post', (req, res) => {});
      r.operations.should.have.length(4);
      r.operations[0].should.be.instanceOf(SimpleOperation);
      r.operations[0].operationId.should.be.equal('Resource.get');
      r.operations[1].operationId.should.be.equal('Resource.get');
      r.operations[2].operationId.should.be.equal('Resource.a');
      r.operations[3].operationId.should.be.equal('Resource.a-post');
    });

    it('should add a SimpleOperation instance with the specified id', function () {
      let r = new Resource();
      r.addOperation('/', 'get', (req, res) => {
      }, 'test');
      r.operations.should.have.length(1);
      r.operations[0].should.be.instanceOf(SimpleOperation);
      r.operations[0].operationId.should.be.equal('Resource.test');
    });

    it('should throw if a no method is specified', function () {
      let r = new Resource();
      should.throw(function () {
        r.addOperation('/');
      }, Error, /invalid method/);
    });

    it('should throw if a no handler is specified', function () {
      let r = new Resource();
      let op = new SimpleOperation(r, '/', 'get', SimpleOperation.prototype.handler);
      should.throw(function () {
        op.handler()
      }, Error, /handler not defined/);
    });

  });

});
