import * as chai from 'chai';
import * as spies from 'chai-spies';
import { API } from '../../dist/api';
import { Operation, SimpleOperation } from '../../dist/operation';
import { Resource } from '../../dist/resource';
import { APIRequest, APIRequestHandler, APIResponse } from '../../dist/types';

const should = chai.should();
chai.use(spies);

describe('Resource', function() {

  describe('constructor', function () {

    it('should create a Resource with no metadata', function () {
      let r = new Resource();
      (r.info as any).name.should.equal('Resource');
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
      const r = (new Resource(meta)).info as any;
      r.name.should.equal(meta.name);
      r.description.should.equal(meta.description);
      r.namePlural.should.equal(meta.namePlural);
      r.id.should.equal(meta.id);
      r.title.should.equal(meta.title);
      r.summaryFields.should.equal(meta.summaryFields);
    });

    it('should set namePlural when not specified', function () {
      let r = (new Resource({name: 'Test'})).info as any;
      r.namePlural.should.equal('Tests');
    });

    it('should instantiate the operations specified in the routes, with the routes property', function () {
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'aaa');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      let r = new Resource({name: 'Test', routes: {'/': {get: TestOp}}});
      r.info.operations.should.have.length(1);
      r.info.operations[0].should.be.instanceOf(TestOp);
      r.info.operations[0].operationId.should.be.equal('Test.aaa');
    });

    it('should instantiate the operations specified in the routes, with the routes argument', function () {
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'aaa');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      let r = new Resource({name: 'Test'}, {'/': {get: TestOp}});
      r.info.operations.should.have.length(1);
      r.info.operations[0].should.be.instanceOf(TestOp);
      r.info.operations[0].operationId.should.be.equal('Test.aaa');
    });

    it('should instantiate the operations specified by request handler', function () {
      let r = new Resource({name: 'Test'}, {
        '/': {
          get: (req, res) => {
          }
        }
      });
      r.info.operations.should.have.length(1);
      r.info.operations[0].should.be.instanceOf(SimpleOperation);
      r.info.operations[0].operationId.should.be.equal('Test.get');
    });

    it('should throw if routes are specified twice', function () {
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'aaa');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      should.throw(function () {
        new Resource({name: 'Test', routes: {}}, {'/': {get: TestOp}})
      }, Error, /double/);
    });

    it('should throw if an invalid route handler is specified', function () {
      should.throw(function () {
        new Resource({name: 'Test'}, {'/': {get: null as any as APIRequestHandler}})
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
      const api = new API();
      api.document.components = { 
        securitySchemes: {
          "myScheme": {
            "type": "oauth2",
            "flows": {
              "authorizationCode": {
                "tokenUrl": "token",
                "authorizationUrl": "/a/b/authorize",
                "scopes": {}
              },
              "implicit": {
                "authorizationUrl": "/a/b/authorize",
                "scopes": {}
              },
            }
          }
        }
      };
      const meta = {
        name: 'Test',
        description: 'Test description',
        id: 'ID',
        title: 'Test title',
        summaryFields: ['a', 'b'],
        externalDocs: { url: 'aaaa' }
      };
      let r = new Resource(meta);
      api.addResource(r);
      const tags = api.document.tags as any;
      tags.should.have.length(1);
      let t = tags[0];
      t.name.should.equal(meta.name);
      t.description.should.equal(meta.description);
      t.externalDocs.should.deep.equal(meta.externalDocs);
      t['x-id'].should.equal(meta.id);
      t['x-title'].should.equal(meta.title);
      t['x-summary-fields'].should.equal(meta.summaryFields);
      const secs = (api.document.components as any).securitySchemes;
      secs.myScheme.flows.authorizationCode.scopes[meta.name].should.equal(r.scopeDescription);
      secs.myScheme.flows.implicit.scopes[meta.name].should.equal(r.scopeDescription);
    });

    it('should also attach all operations', function () {
      const api = new API();
      class TestOp extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'aaa');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      let r1 = new Resource({name: 'Test'}, {'/': {get: TestOp}});
      let r2 = new Resource({name: 'Other'}, {'/': {post: TestOp}});
      api.addResource(r1);
      api.addResource(r2);
      should.exist(api.document.paths['/tests']);
      should.exist(api.document.paths['/tests'].get);
      (api.document.paths['/tests'].get as any).operationId.should.equal('Test.aaa');
      should.exist(api.document.paths['/others']);
      should.exist(api.document.paths['/others'].post);
      (api.document.paths['/others'].post as any).operationId.should.equal('Other.aaa');
    });

  });

  describe('addOperation', function () {

    it('should add an Operation instance', function () {

      class TestOp extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'aaa');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      let r = new Resource();
      r.addOperation(new TestOp(r, '/', 'get'));
      r.info.operations.should.have.length(1);
      r.info.operations[0].should.be.instanceOf(TestOp);
      r.info.operations[0].operationId.should.be.equal('Resource.aaa');
    });

    it('should add a SimpleOperation instance and assign it a default id', function () {
      let r = new Resource();
      r.addOperation('/', 'get', (req, res) => {});
      r.addOperation('', 'get', (req, res) => {});
      r.addOperation('/a', 'get', (req, res) => {});
      r.addOperation('/a', 'post', (req, res) => {});
      r.info.operations.should.have.length(4);
      r.info.operations[0].should.be.instanceOf(SimpleOperation);
      r.info.operations[0].operationId.should.be.equal('Resource.get');
      r.info.operations[1].operationId.should.be.equal('Resource.get');
      r.info.operations[2].operationId.should.be.equal('Resource.a');
      r.info.operations[3].operationId.should.be.equal('Resource.a-post');
    });

    it('should add a SimpleOperation instance with the specified id', function () {
      let r = new Resource();
      r.addOperation('/', 'get', (req, res) => {
      }, 'test');
      r.info.operations.should.have.length(1);
      r.info.operations[0].should.be.instanceOf(SimpleOperation);
      r.info.operations[0].operationId.should.be.equal('Resource.test');
    });

    it('should throw if a no method is specified', function () {
      let r = new Resource();
      should.throw(function () {
        r.addOperation('/' as any as Operation);
      }, Error, /invalid method/);
    });

  });

});
