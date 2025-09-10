import { defineAbility } from '@casl/ability';
import { Scopes } from '@vivocha/scopes';
import * as chai from 'chai';
import express from 'express';
import * as sinon from 'sinon';
import supertest from 'supertest';
import { API } from '../../dist/api.js';
import { Operation, SimpleOperation } from '../../dist/operation.js';
import { Resource } from '../../dist/resource.js';
import { APIRequest, APIResponse } from '../../dist/types.js';

const should = chai.should();

describe('Operation', function () {
  describe('constructor', function () {
    it('should fail if no info is available', function () {
      class Op extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op');
        }
        getInfo() {
          return undefined as any;
        }
        handler(req, res) {}
      }
      (function () {
        new Op(undefined, '', 'get');
      }.should.throw(Error, /Required operationId/));
    });
    it('should fail if no operationId is available', function () {
      class Op extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op');
        }
        getInfo() {
          return {};
        }
        handler(req, res) {}
      }
      (function () {
        new Op(undefined, '', 'get');
      }.should.throw(Error, /Required operationId/));
    });
  });

  describe('attach', function () {
    it('should create document.paths in API if it does not exist', function () {
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 } });
      delete (api.document as any).paths;
      api.addResource(r);
      should.exist(api.document.paths['/tests']);
    });

    it('should add the scope names', function () {
      const api = new API();
      api.document.components = {
        securitySchemes: {
          myOauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                tokenUrl: 'token',
                authorizationUrl: '/a/b/authorize',
                scopes: {},
              },
              implicit: {
                authorizationUrl: '/a/b/authorize',
              },
            },
          },
          myBasic: {
            type: 'http',
            scheme: 'Basic',
          },
        },
      } as any;
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      class Op2 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op2');
        }
        handler(req: APIRequest, res: APIResponse, next) {}
      }
      let r = new Resource({ name: 'Test' }, { '/': { get: Op1, post: Op2 } });
      api.addResource(r);
      should.exist(api.document.paths['/tests']);
      should.exist(api.document.paths['/tests'].get);
      should.exist(api.document.paths['/tests'].post);
      const doc = api.document as any;
      doc.paths['/tests'].get.operationId.should.equal('Test.op1');
      doc.paths['/tests'].post.operationId.should.equal('Test.op2');

      should.exist(doc.components.securitySchemes.myOauth2.flows.authorizationCode.scopes['Test']);
      should.exist(doc.components.securitySchemes.myOauth2.flows.authorizationCode.scopes['Test.op1']);
      should.exist(doc.components.securitySchemes.myOauth2.flows.authorizationCode.scopes['Test.op2']);
      should.exist(doc.components.securitySchemes.myOauth2.flows.implicit.scopes['Test']);
      should.exist(doc.components.securitySchemes.myOauth2.flows.implicit.scopes['Test.op1']);
      should.exist(doc.components.securitySchemes.myOauth2.flows.implicit.scopes['Test.op2']);
    });
  });

  describe('router', function () {
    it('should add an handler that gets requests', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({ a: 5 });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 } });
      api.addResource(r);

      return api
        .router()
        .then((router) => {
          app.use(router);
          server = app.listen(port);

          return request
            .get('/tests/')
            .expect(200)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.a.should.equal(5);
              spyFunc.calledOnce.should.be.true;
            });
        })
        .then(
          () => {
            server.close();
          },
          (err) => {
            server.close();
            throw err;
          }
        );
    });
    it('should automatically parse json bodies for put, post and patch is no requestBody is specified in the spec', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
        handler(req, res) {
          req.body.a.b.should.equal(5);
          res.end();
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { post: Op1 } });
      api.addResource(r);

      return api
        .router()
        .then((router) => {
          app.use(router);
          server = app.listen(port);

          return request
            .post('/tests/')
            .send({ a: { b: 5 } })
            .expect(200);
        })
        .then(
          () => {
            server.close();
          },
          (err) => {
            server.close();
            throw err;
          }
        );
    });
  });

  describe('validators', function () {
    describe('header', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({ headers: req.headers });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.parameters = [
            {
              name: 'x-test-p1',
              in: 'header',
              schema: {
                type: 'boolean',
              },
              required: true,
            },
            {
              name: 'x-test-p2',
              in: 'header',
              schema: {
                type: 'number',
              },
            },
            {
              name: 'x-test-p3',
              in: 'header',
              schema: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
          ];
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 } });
      api.addResource(r);

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        if (server) {
          server.close();
        }
      });

      it('should fail if a required header is missing', function () {
        return request
          .get('/tests/')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('required');
            data.info.path.should.equal('headers.x-test-p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a header has the wrong scalar type (1)', function () {
        return request
          .get('/tests/')
          .set('x-test-p1', 'test')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('headers.x-test-p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a header has the wrong scalar type (2)', function () {
        return request
          .get('/tests/')
          .set('x-test-p1', 'false')
          .set('x-test-p2', 'test')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('headers.x-test-p2');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a header has the wrong item type', function () {
        return request
          .get('/tests/')
          .set('x-test-p1', 'true')
          .set('x-test-p2', '5')
          .set('x-test-p3', 'test')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('items');
            data.info.errors[0].type.should.equal('type');
            data.info.errors[0].path.should.equal('headers.x-test-p3/0');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should correctly return all header parameters', function () {
        return request
          .get('/tests/')
          .set('x-test-p1', 'true')
          .set('x-test-p2', '5')
          .set('x-test-p3', '1,2,3')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.headers['x-test-p1'].should.equal(true);
            data.headers['x-test-p2'].should.equal(5);
            data.headers['x-test-p3'].should.deep.equal([1, 2, 3]);
            spyFunc.calledOnce.should.be.true;
          });
      });
    });

    describe('cookie', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({ cookies: req.cookies });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.parameters = [
            {
              name: 'test-p1',
              in: 'cookie',
              schema: {
                type: 'boolean',
              },
              required: true,
            },
            {
              name: 'test-p2',
              in: 'cookie',
              schema: {
                type: 'number',
              },
            },
            {
              name: 'test-p3',
              in: 'cookie',
              schema: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
          ];
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 } });
      api.addResource(r);

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        if (server) {
          server.close();
        }
      });

      it('should fail if a required cookie is missing', function () {
        return request
          .get('/tests/')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('required');
            data.info.path.should.equal('cookies.test-p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a cookie has the wrong scalar type (1)', function () {
        return request
          .get('/tests/')
          .set('Cookie', ['test-p1=test'])
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('cookies.test-p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a cookie has the wrong scalar type (2)', function () {
        return request
          .get('/tests/')
          .set('Cookie', ['test-p1=false;test-p2=test'])
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('cookies.test-p2');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a cookie has the wrong item type', function () {
        return request
          .get('/tests/')
          .set('Cookie', ['test-p1=true;test-p2=5;test-p3=test'])
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('items');
            data.info.errors[0].type.should.equal('type');
            data.info.errors[0].path.should.equal('cookies.test-p3/0');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should correctly return all cookie parameters', function () {
        return request
          .get('/tests/')
          .set('Cookie', ['test-p1=true;test-p2=5;test-p3=1,2,3'])
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.cookies['test-p1'].should.equal(true);
            data.cookies['test-p2'].should.equal(5);
            data.cookies['test-p3'].should.deep.equal([1, 2, 3]);
            spyFunc.calledOnce.should.be.true;
          });
      });
    });

    describe('path', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({ params: req.params });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.parameters = [
            {
              name: 'p1',
              in: 'path',
              schema: {
                type: 'boolean',
              },
            },
            {
              name: 'p2',
              in: 'path',
              schema: {
                type: 'number',
              },
            },
          ];
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/:p1': { get: Op1 }, '/:p1/:p2': { get: Op1 } });
      api.addResource(r);

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        server.close();
      });

      it('should fail if a path parameter is missing', function () {
        return request
          .get('/tests/true')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('required');
            data.info.path.should.equal('params.p2');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a path parameter has the wrong type (1)', function () {
        return request
          .get('/tests/aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('params.p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a path parameter has the wrong type (2)', function () {
        return request
          .get('/tests/true/aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('params.p2');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should correctly return all path parameters', function () {
        return request
          .get('/tests/true/5')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.params.p1.should.equal(true);
            data.params.p2.should.equal(5);
            spyFunc.calledOnce.should.be.true;
          });
      });
    });

    describe('query', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({ query: req.query });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.parameters = [
            {
              name: 'p1',
              in: 'query',
              schema: {
                type: 'boolean',
              },
              required: true,
            },
            {
              name: 'p2',
              in: 'query',
              schema: {
                type: 'number',
                default: 10,
              },
            },
            {
              name: 'p3',
              in: 'query',
              style: 'pipeDelimited',
              schema: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
          ];
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 } });
      api.addResource(r);

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        server.close();
      });

      it('should fail if a required query parameter is missing and no default is defined', function () {
        return request
          .get('/tests/')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('required');
            data.info.path.should.equal('query.p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a query parameter has the wrong scalar type (1)', function () {
        return request
          .get('/tests/?p1=aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('query.p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a query parameter has the wrong scalar type (2)', function () {
        return request
          .get('/tests/?p1=true&p2=aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('query.p2');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a query parameter has the wrong item type', function () {
        return request
          .get('/tests/?p1=false&p3=1|aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('items');
            data.info.errors[0].type.should.equal('type');
            data.info.errors[0].path.should.equal('query.p3/1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should correctly return all query parameter', function () {
        return request
          .get('/tests/?p1=true&p2=5&p3=1|2|3')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.query.p1.should.equal(true);
            data.query.p2.should.equal(5);
            data.query.p3.should.deep.equal([1, 2, 3]);
            spyFunc.calledOnce.should.be.true;
          });
      });

      it('should use the default values if a query parameter is missing', function () {
        return request
          .get('/tests/?p1=true')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.query.p1.should.equal(true);
            data.query.p2.should.equal(10);
            spyFunc.calledTwice.should.be.true;
          });
      });
    });

    describe('body', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({ body: req.body });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    a: {
                      type: 'boolean',
                    },
                    b: {
                      type: 'integer',
                    },
                  },
                  additionalProperties: false,
                  required: ['a'],
                },
              },
            },
            required: true,
          };
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }
      class Op2 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op2');
          this.info.requestBody = {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                },
              },
            },
          };
        }
        handler(req, res) {
          res.send({});
        }
      }
      class Op3 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op3');
          this.info.requestBody = {
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  required: ['test'],
                  additionalProperties: false,
                  properties: {
                    test: {
                      type: 'integer',
                    },
                  },
                },
              },
            },
          };
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      class Op4 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op4');
          this.info.requestBody = {
            content: {
              'unsupported/body-type': {
                schema: {},
              },
            },
          };
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/a': { post: Op1 }, '/b': { post: Op2 }, '/c': { post: Op3 }, '/d': { post: Op4 } });
      api.addResource(r);

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        server.close();
      });

      it('should throw is a requestBody is missing the content', function () {
        class Op1 extends Operation {
          constructor(resource, path, method) {
            super(resource, path, method, 'op');
            this.info.requestBody = {} as any;
          }
          handler(req, res) {}
        }
        const api = new API();
        const r = new Resource({ name: 'Test' }, { '/a': { post: Op1 } });
        api.addResource(r);
        return api.router().should.be.rejectedWith(Error, /Invalid request body/);
      });

      it('should throw is a requestBody is missing the schema', function () {
        class Op1 extends Operation {
          constructor(resource, path, method) {
            super(resource, path, method, 'op');
            this.info.requestBody = {
              content: {
                'application/json': {},
              },
              required: true,
            };
          }
          handler(req, res) {}
        }
        const api = new API();
        const r = new Resource({ name: 'Test' }, { '/a': { post: Op1 } });
        api.addResource(r);
        return api.router().should.be.rejectedWith(Error, /Schema missing/);
      });

      it('should fail if a requested body is missing', function () {
        return request
          .post('/tests/a')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('required');
            data.info.path.should.equal('body');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should not fail if an optional body is missing', function () {
        return request
          .post('/tests/b')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {});
      });

      it('should fail if the body has the wrong type (1)', function () {
        return request
          .post('/tests/a')
          .send({})
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('required');
            data.info.path.should.equal('body/a');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if the body has the wrong type (2)', function () {
        return request
          .post('/tests/a')
          .send({ a: 'aaa' })
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('properties');
            data.info.errors[0].type.should.equal('type');
            data.info.errors[0].path.should.equal('body/a');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if the body has the wrong type (3)', function () {
        return request
          .post('/tests/a')
          .send({ a: true, b: 'aaa' })
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('properties');
            data.info.errors[0].type.should.equal('type');
            data.info.errors[0].path.should.equal('body/b');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should correctly return the body', function () {
        return request
          .post('/tests/a')
          .send({ a: true, b: 5 })
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.body.a.should.equal(true);
            data.body.b.should.equal(5);
            spyFunc.calledOnce.should.be.true;
          });
      });

      it('should accept and parse urlencoded bodies', function () {
        return request
          .post('/tests/c')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('test=5')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.body.test.should.equal(5);
          });
      });

      it('should ignore insupported body types', function () {
        return request
          .post('/tests/d')
          .set('Content-Type', 'usupported/body-type')
          .send('test=5')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({});
          });
      });
    });

    describe('parameters as refs', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      const api = new API();
      if (!api.document.components) api.document.components = {};
      if (!api.document.components.schemas) api.document.components.schemas = {};
      api.document.components.schemas.test = <any>{
        definitions: {
          bool: {
            type: 'boolean',
          },
        },
      };
      if (!api.document.components.parameters) api.document.components.parameters = {};
      api.document.components.parameters.p1 = {
        name: 'p1',
        in: 'query',
        schema: { $ref: '#/components/schemas/test/definitions/bool' },
        required: true,
      };
      api.document.components.parameters.p2 = {
        name: 'p2',
        in: 'query',
        schema: {
          type: 'number',
        },
      };
      api.document.components.parameters.p3 = {
        name: 'p3',
        in: 'query',
        style: 'pipeDelimited',
        schema: {
          type: 'array',
          items: { type: 'integer' },
        },
      };

      const spyFunc = sinon.spy(function (req, res) {
        res.send({ query: req.query });
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.parameters = [{ $ref: '#/components/parameters/p1' }, { $ref: '#/components/parameters/p2' }, { $ref: '#/components/parameters/p3' }];
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/': { get: Op1 } });
      api.addResource(r);

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        server.close();
      });

      it('should fail if a required query parameter is missing', function () {
        return request
          .get('/tests/')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('required');
            data.info.path.should.equal('query.p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a query parameter has the wrong scalar type (1)', function () {
        return request
          .get('/tests/?p1=aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('query.p1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a query parameter has the wrong scalar type (2)', function () {
        return request
          .get('/tests/?p1=true&p2=aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('type');
            data.info.path.should.equal('query.p2');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should fail if a query parameter has the wrong item type', function () {
        return request
          .get('/tests/?p1=false&p3=1|aaa')
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('ValidationError');
            data.info.type.should.equal('items');
            data.info.errors[0].type.should.equal('type');
            data.info.errors[0].path.should.equal('query.p3/1');
            spyFunc.calledOnce.should.be.false;
          });
      });

      it('should correctly return all query parameter', function () {
        return request
          .get('/tests/?p1=true&p2=5&p3=1|2|3')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.query.p1.should.equal(true);
            data.query.p2.should.equal(5);
            data.query.p3.should.deep.equal([1, 2, 3]);
            spyFunc.calledOnce.should.be.true;
          });
      });
    });
  });

  describe('scopes', function () {
    describe('no scopes supplied', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      class API1 extends API {
        initSecurity(req, res, next) {
          next();
        }
      }
      const api = new API1();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({});
      });
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
        }
        get swaggerScopes() {
          return {};
        }
        handler(req, res) {
          spyFunc(req, res);
        }
      }

      let r = new Resource({ name: 'Test' }, { '/1': { get: Op1 }, '/2': { get: spyFunc } });
      api.addResource(r);

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        server.close();
      });

      it('should not perform any scope validation, if the resource does not define scopes', function () {
        return request
          .get('/tests/1')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(() => {
            spyFunc.calledOnce.should.be.true;
          });
      });

      it('should fail if scopes are required and none are supplied', function () {
        return request
          .get('/tests/2')
          .expect(401)
          .expect('Content-Type', /json/)
          .then(() => {
            spyFunc.calledOnce.should.be.true;
          });
      });
    });

    describe('scopes supplied', function () {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const app = express();
      let server;

      class API1 extends API {
        initSecurity(req, res, next) {
          req.scopes = new Scopes(['a.*', '*.x', '-a.x', 'c.y']);
          next();
        }
      }
      const api = new API1();
      const spyFunc = sinon.spy(function (req, res) {
        res.send({});
      });
      api.addResource(
        new Resource(
          { name: 'a', namePlural: 'a' },
          {
            '/x': {
              get: spyFunc,
            },
            '/y': {
              get: spyFunc,
            },
          }
        )
      );
      api.addResource(
        new Resource(
          { name: 'b', namePlural: 'b' },
          {
            '/x': {
              get: spyFunc,
            },
            '/y': {
              get: spyFunc,
            },
          }
        )
      );
      api.addResource(
        new Resource(
          { name: 'c', namePlural: 'c' },
          {
            '/x': {
              get: spyFunc,
            },
            '/y': {
              get: spyFunc,
            },
          }
        )
      );

      before(function () {
        return api.router().then((router) => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        server.close();
      });

      it('should fail if a required scope is missing', function () {
        return Promise.all([request.get('/a/x').expect(403).expect('Content-Type', /json/), request.get('/b/y').expect(403).expect('Content-Type', /json/)]);
      });

      it('should succeed if required scopes are present', function () {
        return Promise.all([
          request.get('/a/y').expect(200).expect('Content-Type', /json/),
          request.get('/b/x').expect(200).expect('Content-Type', /json/),
          request.get('/c/x').expect(200).expect('Content-Type', /json/),
          request.get('/c/y').expect(200).expect('Content-Type', /json/),
        ]);
      });
    });
  });

  describe('ability', function () {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const app = express();
    let server;

    class API1 extends API {
      initSecurity(req, res, next) {
        req.ability = defineAbility((can, cannot) => {
          can('manage', 'a');
          can('x', 'all');
          cannot('x', 'a');
          can('y', 'c');
        });
        next();
      }
    }
    const api = new API1();
    const spyFunc = sinon.spy(function (req, res) {
      res.send({});
    });
    api.addResource(
      new Resource(
        { name: 'a', namePlural: 'a' },
        {
          '/x': {
            get: spyFunc,
          },
          '/y': {
            get: spyFunc,
          },
        }
      )
    );
    api.addResource(
      new Resource(
        { name: 'b', namePlural: 'b' },
        {
          '/x': {
            get: spyFunc,
          },
          '/y': {
            get: spyFunc,
          },
        }
      )
    );
    api.addResource(
      new Resource(
        { name: 'c', namePlural: 'c' },
        {
          '/x': {
            get: spyFunc,
          },
          '/y': {
            get: spyFunc,
          },
        }
      )
    );

    before(function () {
      return api.router().then((router) => {
        app.use(router);
        server = app.listen(port);
      });
    });

    after(function () {
      server.close();
    });

    it('should fail if a required ability is not granted', function () {
      return Promise.all([request.get('/a/x').expect(403).expect('Content-Type', /json/), request.get('/b/y').expect(403).expect('Content-Type', /json/)]);
    });

    it('should succeed if required abilities are present', function () {
      return Promise.all([
        request.get('/a/y').expect(200).expect('Content-Type', /json/),
        request.get('/b/x').expect(200).expect('Content-Type', /json/),
        request.get('/c/x').expect(200).expect('Content-Type', /json/),
        request.get('/c/y').expect(200).expect('Content-Type', /json/),
      ]);
    });
    it('should return the permitted fields', async function () {
      class Op1 extends Operation {
        handler(req, res) {}
      }
      class Op2 extends Operation {
        handler(req, res) {}
        get swaggerScopes() {
          return {
            'Test.op1': 'op1',
            'Test.op2': 'op2',
          };
        }
      }
      class Op3 extends Operation {
        handler(req, res) {}
        get swaggerScopes() {
          return {};
        }
      }
      const r = new Resource({ name: 'Test' });
      const op1 = new Op1(r, '/1', 'get', 'op1');
      const op2 = new Op2(r, '/2', 'get', 'op2');
      const op3 = new Op3(r, '/3', 'get', 'op3');
      r.addOperation(op1);
      r.addOperation(op2);
      r.addOperation(op3);
      const api = new API();
      api.addResource(r);
      await api.router();
      const ability = defineAbility((can, cannot) => {
        can('op1', 'Test');
        can('op2', 'Test', ['a', 'b']);
      });
      const op1Fields = [...op1.permittedFields(ability)];
      op1Fields.should.deep.equal(['**']);
      const op2Fields = [...op2.permittedFields(ability)];
      op2Fields.should.deep.equal(['**', 'a', 'b']);
      const op3Fields = [...op3.permittedFields(ability)];
      op3Fields.should.deep.equal([]);
    });
    it('should filter fields calling the utility method', function () {
      const api = new API();
      const r = new Resource({ name: 'x' });
      const op = new SimpleOperation(() => {}, new Resource({ name: 'x' }), '/_', 'get', 'y');
      r.addOperation(op);
      api.addResource(r);
      op.filterFields(
        defineAbility((can, cannot) => {
          can('y', 'x', ['a', 'b'], {});
        }) as any,
        { a: 1, b: 2, c: 3 }
      ).should.deep.equal({ a: 1, b: 2 });
    });
  });
});
