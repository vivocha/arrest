var chai = require('chai')
  , spies = require('chai-spies')
  , should = chai.should()
  , supertest = require('supertest')
  , express = require('express')
  , Scopes = require('../dist/scopes').Scopes
  , API = require('../dist/api').API
  , Resource = require('../dist/resource').Resource
  , Operation = require('../dist/operation').Operation


chai.use(spies);

describe('Operation', function() {

  describe('attach', function() {

    it('should add the scope names', function() {
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
            "authorizationUrl": "/a/b/authorize"
          },
          "basic": {
            "type": "whatever"
          }
        }
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
      }
      class Op2 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op2');
        }
      }
      let r = new Resource({ name: 'Test' }, { '/': { get: Op1, post: Op2 }});
      api.addResource(r);
      should.exist(api.paths['/tests']);
      should.exist(api.paths['/tests'].get);
      should.exist(api.paths['/tests'].post);
      api.paths['/tests'].get.operationId.should.equal('Test.op1');
      api.paths['/tests'].post.operationId.should.equal('Test.op2');

      should.exist(api.securityDefinitions.access_code.scopes['Test']);
      should.exist(api.securityDefinitions.access_code.scopes['Test.op1']);
      should.exist(api.securityDefinitions.access_code.scopes['Test.op2']);
    });

  });

  describe('router', function() {

    it('should add an handler that gets requests', function() {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API({
        info: {
          version: '1.0.0'
        },
        securityDefinitions: {
          "access_code": {
            "type": "oauth2",
            "flow": "accessCode",
            "tokenUrl": "token"
          }
        }
      });
      const spy = chai.spy(function(req, res) {
        res.send({ a: 5 });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 }});
      api.addResource(r);

      return api.router().then(router => {
        app.use(router);
        server = app.listen(port);

        return request
          .get('/tests/')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.a.should.equal(5);
            spy.should.have.been.called.once();
          });

      }).then(() => {
        server.close();
      }, err => {
        server.close();
        throw err;
      });

    });

  });

  describe('validators', function() {

    describe('header', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spy = chai.spy(function(req, res) {
        res.send({ headers: req.headers });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.setInfo({
            parameters: [
              {
                "name": "x-test-p1",
                "in": "header",
                "type": "boolean",
                "required": true
              },
              {
                "name": "x-test-p2",
                "in": "header",
                "type": "number",
              },
              {
                "name": "x-test-p3",
                "in": "header",
                "type": "array",
                "collectionFormat": "pipes",
                "items": { "type": "integer" }
              }
            ]
          });
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 }});
      api.addResource(r);

      before(function() {
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });


      it('should fail if a required header is missing', function() {
        return request
          .get('/tests/')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('required');
            data.info.should.equal('headers.x-test-p1');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a header has the wrong scalar type (1)', function() {
        return request
          .get('/tests/')
          .set('x-test-p1', 'test')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('headers.x-test-p1');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a header has the wrong scalar type (2)', function() {
        return request
          .get('/tests/')
          .set('x-test-p1', 'false')
          .set('x-test-p2', 'test')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('headers.x-test-p2');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a header has the wrong item type', function() {
        return request
          .get('/tests/')
          .set('x-test-p1', 'true')
          .set('x-test-p2', '5')
          .set('x-test-p3', 'test')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('headers.x-test-p3/0');
            spy.should.not.have.been.called.once();
          });
      });

      it('should correctly return all header parameters', function() {
        return request
          .get('/tests/')
          .set('x-test-p1', 'true')
          .set('x-test-p2', '5')
          .set('x-test-p3', '1|2|3')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.headers['x-test-p1'].should.equal(true);
            data.headers['x-test-p2'].should.equal(5);
            data.headers['x-test-p3'].should.deep.equal([ 1, 2, 3]);
            spy.should.have.been.called.once();
          });
      });

    });

    describe('path', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spy = chai.spy(function(req, res) {
        res.send({ params: req.params });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.setInfo({
            parameters: [
              {
                "name": "p1",
                "in": "path",
                "type": "boolean"
              },
              {
                "name": "p2",
                "in": "path",
                "type": "number",
              }
            ]
          });
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/:p1': { get: Op1 }, '/:p1/:p2': { get: Op1 }});
      api.addResource(r);

      before(function() {
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });


      it('should fail if a path parameter is missing', function() {
        return request
          .get('/tests/true')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('required');
            data.info.should.equal('params.p2');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a path parameter has the wrong type (1)', function() {
        return request
          .get('/tests/aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('params.p1');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a path parameter has the wrong type (2)', function() {
        return request
          .get('/tests/true/aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('params.p2');
            spy.should.not.have.been.called.once();
          });
      });

      it('should correctly return all header parameters', function() {
        return request
          .get('/tests/true/5')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.params.p1.should.equal(true);
            data.params.p2.should.equal(5);
            spy.should.have.been.called.once();
          });
      });

    });

    describe('query', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spy = chai.spy(function(req, res) {
        res.send({ query: req.query });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.setInfo({
            parameters: [
              {
                "name": "p1",
                "in": "query",
                "type": "boolean",
                "required": true
              },
              {
                "name": "p2",
                "in": "query",
                "type": "number",
              },
              {
                "name": "p3",
                "in": "query",
                "type": "array",
                "collectionFormat": "pipes",
                "items": { "type": "integer" }
              }
            ]
          });
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 }});
      api.addResource(r);

      before(function() {
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });


      it('should fail if a required query parameter is missing', function() {
        return request
          .get('/tests/')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('required');
            data.info.should.equal('query.p1');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a query parameter has the wrong scalar type (1)', function() {
        return request
          .get('/tests/?p1=aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('query.p1');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a query parameter has the wrong scalar type (2)', function() {
        return request
          .get('/tests/?p1=true&p2=aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('query.p2');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if a query parameter has the wrong item type', function() {
        return request
          .get('/tests/?p1=false&p3=1|aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('query.p3/1');
            spy.should.not.have.been.called.once();
          });
      });

      it('should correctly return all query parameter', function() {
        return request
          .get('/tests/?p1=true&p2=5&p3=1|2|3')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.query.p1.should.equal(true);
            data.query.p2.should.equal(5);
            data.query.p3.should.deep.equal([ 1, 2, 3]);
            spy.should.have.been.called.once();
          });
      });

    });

    describe('body', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spy = chai.spy(function(req, res) {
        res.send({ body: req.body });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.setInfo({
            parameters: [
              {
                "name": "aaa",
                "in": "body",
                "schema": {
                  "type": "object",
                  "properties": {
                    "a": {
                      "type": "boolean"
                    },
                    "b": {
                      "type": "integer"
                    }
                  },
                  "additionalProperties": false,
                  "required": [ "a" ]
                },
                "required": true
              }
            ]
          });
        }
        handler(req, res) {
          spy(req, res);
        }
      }
      class Op2 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.setInfo({
            parameters: [
              {
                "name": "bbb",
                "in": "body",
                "schema": {
                  "type": "object",
                }
              }
            ]
          });
        }
        handler(req, res) {
          res.send({});
        }
      }

      let r = new Resource({ name: 'Test' }, { '/a': { post: Op1 }, '/b': { post: Op2 }});
      api.addResource(r);

      before(function() {
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });


      it('should fail if a requested body is missing', function() {
        return request
          .post('/tests/a')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('required');
            data.info.should.equal('body');
            spy.should.not.have.been.called.once();
          });
      });

      it('should not fail if an optional body is missing', function() {
        return request
          .post('/tests/b')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
          });
      });

      it('should fail if the body has the wrong type (1)', function() {
        return request
          .post('/tests/a')
          .send({ })
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('required');
            data.info.should.equal('body/a');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if the body has the wrong type (2)', function() {
        return request
          .post('/tests/a')
          .send({ a: 'aaa' })
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('body/a');
            spy.should.not.have.been.called.once();
          });
      });

      it('should fail if the body has the wrong type (3)', function() {
        return request
          .post('/tests/a')
          .send({ a: true, b: 'aaa' })
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('type');
            data.info.should.equal('body/b');
            spy.should.not.have.been.called.once();
          });
      });

      it('should correctly return the body', function() {
        return request
          .post('/tests/a')
          .send({ a: true, b: 5 })
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.body.a.should.equal(true);
            data.body.b.should.equal(5);
            spy.should.have.been.called.once();
          });
      });

    });

  });

  describe('scopes', function() {

    describe('no scopes supplied', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      class API1 extends API {
        securityValidator(req, res, next) {
          next();
        }
      }
      const api = new API1({ info: { version: '1.0.0' }});
      const spy = chai.spy(function(req, res) {
        res.send({});
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
        get swaggerScopes() {
          return [];
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/1': { get: Op1 }, '/2': { get: spy }});
      api.addResource(r);

      before(function() {
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });

      it('should not perform any scope validation, if the resource does not define scopes', function() {
        return request
          .get('/tests/1')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(() => {
            spy.should.have.been.called.once();
          });
      });

      it('should fail if scopes are required and none are supplied', function() {
        return request
          .get('/tests/2')
          .expect(401)
          .expect('Content-Type', /json/)
          .then(() => {
            spy.should.have.been.called.once();
          });
      });

    });

    describe('scopes supplied', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      class API1 extends API {
        securityValidator(req, res, next) {
          req.scopes = new Scopes([ 'a.*', '*.x', '-a.x', 'c.y' ]);
          next();
        }
      }
      const api = new API1({ info: { version: '1.0.0' }});
      const spy = chai.spy(function(req, res) {
        res.send({});
      });
      api.addResource(new Resource({ name: 'a', namePlural: 'a' }, {
        '/x': {
          get: spy
        },
        '/y': {
          get: spy
        }
      }));
      api.addResource(new Resource({ name: 'b', namePlural: 'b' }, {
        '/x': {
          get: spy
        },
        '/y': {
          get: spy
        }
      }));
      api.addResource(new Resource({ name: 'c', namePlural: 'c' }, {
        '/x': {
          get: spy
        },
        '/y': {
          get: spy
        }
      }));

      before(function() {
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });

      it('should fail if a required scope is missing', function() {
        return Promise.all([
          request
            .get('/a/x')
            .expect(403)
            .expect('Content-Type', /json/),
          request
            .get('/b/y')
            .expect(403)
            .expect('Content-Type', /json/)
        ]);
      });

      it('should succeed if required scopes are present', function() {
        return Promise.all([
          request
            .get('/a/y')
            .expect(200)
            .expect('Content-Type', /json/),
          request
            .get('/b/x')
            .expect(200)
            .expect('Content-Type', /json/),
          request
            .get('/c/x')
            .expect(200)
            .expect('Content-Type', /json/),
          request
            .get('/c/y')
            .expect(200)
            .expect('Content-Type', /json/)
        ]);
      });

    });

  });

});
