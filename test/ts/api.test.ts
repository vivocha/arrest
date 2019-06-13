import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as spies from 'chai-spies';
import * as express from 'express';
import { OpenAPIV3, ParserError, RetrieverError, SchemaObject, ValidationError } from 'openapi-police';
import * as pem from 'pem';
import * as supertest from 'supertest';
import { API } from '../../dist/api';
import { DEFAULT_DOCUMENT } from '../../dist/defaults';
import { RESTError } from '../../dist/error';
import { Operation } from '../../dist/operation';
import { Resource } from '../../dist/resource';
import { Scopes } from '../../dist/scopes';
import { simpleAPI, simpleAPI2, simpleAPI3, simpleAPI4 } from './dummy-api';

const should = chai.should();
chai.use(spies);
chai.use(chaiAsPromised);

describe('API', function() {
  describe('constructor', function() {
    it('should fail to create an API instance if an invalid version is specified', function() {
      (function() {
        new API(({ version: true } as any) as OpenAPIV3.InfoObject);
      }.should.throw(Error, 'Invalid version'));
      (function() {
        new API(({ version: 'a' } as any) as OpenAPIV3.InfoObject);
      }.should.throw(Error, 'Invalid version'));
      (function() {
        new API(({ version: 1 } as any) as OpenAPIV3.InfoObject);
      }.should.throw(Error, 'Invalid version'));
      (function() {
        new API(({ version: '1' } as any) as OpenAPIV3.InfoObject);
      }.should.throw(Error, 'Invalid version'));
      (function() {
        new API(({ version: '1.0' } as any) as OpenAPIV3.InfoObject);
      }.should.throw(Error, 'Invalid version'));
      (function() {
        new API();
      }.should.not.throw);
    });

    it('should create an API instance', function() {
      let api = new API();
      api.document.openapi.should.equal('3.0.2');
      api.document.info.version.should.equal('1.0.0');
      api.document.info.title.should.equal('REST API');
    });
  });

  describe('router', function() {
    it('should return an Expressjs router', function() {
      let api = new API();
      return api.router().then(router => {
        router.should.be.a('function');
      });
    });

    it('should return the same object when called twice', function() {
      let api = new API();
      return api.router().then(router1 => {
        return api.router().then(router2 => {
          router1.should.equal(router2);
        });
      });
    });
  });

  describe('plain api (no resources)', function() {
    describe('/openapi.json', function() {
      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const api = new API();
      const app = express();
      let server;

      before(function() {
        api.document.components = {
          securitySchemes: {
            myScheme: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  tokenUrl: 'token',
                  authorizationUrl: '/a/b/authorize',
                  scopes: {}
                },
                implicit: {
                  authorizationUrl: '/a/b/authorize',
                  scopes: {}
                }
              }
            },
            otherScheme: {
              type: 'http',
              scheme: 'basic'
            }
          }
        };

        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });

      it('should fail if the request is missing the Host header', function() {
        let app2 = express();
        let server2;
        return api
          .router()
          .then(router => {
            app2.use((req, res, next) => {
              delete req.headers.host;
              next();
            });
            app2.use(router);
            server2 = app2.listen(port + 1);
            return supertest('http://localhost:' + (port + 1))
              .get('/openapi.json')
              .expect(400)
              .expect('Content-Type', /json/)
              .then(({ body: data }) => {
                should.exist(data);
                data.info.should.match(/Missing Host/);
              });
          })
          .then(
            () => {
              server2.close();
            },
            err => {
              server2.close();
              throw err;
            }
          );
      });

      it('should return a default openapi file', function() {
        return request
          .get('/openapi.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.openapi.should.equal(DEFAULT_DOCUMENT.openapi);
            data.servers[0].url.should.equal(`${basePath}`);
            should.not.exist(data.id);
            should.not.exist(data.tags);
          });
      });

      it('should normalize oauth2 urls in security definitions', function() {
        return request
          .get('/openapi.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.components.securitySchemes.myScheme.flows.authorizationCode.tokenUrl.should.equal(basePath + '/token');
            data.components.securitySchemes.myScheme.flows.implicit.authorizationUrl.should.equal(basePath + '/a/b/authorize');
          });
      });
    });
  });

  describe('attach', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const api = new API({ version: '3.2.1', title: 'test' });
    const app = express();
    const r = express.Router();
    let server;

    before(function() {
      app.use(r);
      return api.attach(r).then(router => {
        app.use(router);
        server = app.listen(port);
      });
    });

    after(function() {
      server.close();
    });

    it('should attach the api on /v{major version} and reflect that in openapi.json', function() {
      return request
        .get('/v3/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          should.exist(data);
          data.openapi.should.equal(DEFAULT_DOCUMENT.openapi);
          data.servers[0].url.should.equal(`${basePath}/v3`);
        });
    });

    it('should attach another api version and reflect that in the swagger', function() {
      const api2 = new API({ version: '4.0.0', title: 'test' });

      return api2.attach(r).then(() => {
        return request
          .get('/v4/openapi.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.openapi.should.equal(DEFAULT_DOCUMENT.openapi);
            data.servers[0].url.should.equal(`${basePath}/v4`);
          });
      });
    });

    it('should attach another api with the same version which will handle resources to handled by the first one', function() {
      const api3 = new API({ version: '3.2.2', title: 'test' });
      api3.addResource(new Resource({ routes: { '/': { get: (req, res) => res.json({ result: 10 }) } } }));

      return api3.attach(r).then(() => {
        return request
          .get('/v3/resources')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.result.should.equal(10);
          });
      });
    });
  });

  describe('listen', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server1;
    let server2;

    afterEach(function() {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      if (server1) {
        server1.close();
      }
      if (server2) {
        server2.close();
      }
    });

    it('should fail if no ports are specified', function() {
      const api = new API({ version: '3.2.1', title: 'test' });
      return api.listen((undefined as any) as number).then(
        () => {
          throw new Error('should not get here');
        },
        err => {
          err.should.be.instanceOf(Error);
          err.message.should.match(/no listen ports specified/);
        }
      );
    });

    it('should fail if no https options are specified', function() {
      const api = new API({ version: '3.2.1', title: 'test' });
      api.listen(0, 1).then(
        () => {
          throw new Error('should not get here');
        },
        err => true
      );
    });

    it('should create an api server listening to http on the requested port', function() {
      const api = new API({ version: '3.2.1', title: 'test' });
      return api.listen(port).then(server => {
        server1 = server;
        return request
          .get('/openapi.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.openapi.should.equal(DEFAULT_DOCUMENT.openapi);
            data.servers[0].url.should.equal(`${basePath}`);
          });
      });
    });

    it('should create an api server listening to https on the requested port', function() {
      return new Promise((resolve, reject) => {
        pem.createCertificate({ days: 1, selfSigned: true }, function(err, keys) {
          if (err) {
            reject(err);
          } else {
            resolve(keys);
          }
        });
      }).then((keys: any) => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        const api = new API({ version: '3.2.1', title: 'test' });
        return api.listen(0, port, { key: keys.serviceKey, cert: keys.certificate }).then(server => {
          server1 = server;
          return supertest('https://' + host)
            .get('/openapi.json')
            .expect(200)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.openapi.should.equal(DEFAULT_DOCUMENT.openapi);
              data.servers[0].url.should.equal(`https://${host}`);
            });
        });
      });
    });

    it('should create an api server listening to both http and https on the requested ports', function() {
      return new Promise((resolve, reject) => {
        pem.createCertificate({ days: 1, selfSigned: true }, function(err, keys) {
          if (err) {
            reject(err);
          } else {
            resolve(keys);
          }
        });
      }).then((keys: any) => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        const api = new API({ version: '3.2.1', title: 'test' });
        return api.listen(port, port + 2, { key: keys.serviceKey, cert: keys.certificate }).then(servers => {
          server1 = servers[0];
          server2 = servers[1];
          return Promise.all([
            request
              .get('/openapi.json')
              .expect(200)
              .expect('Content-Type', /json/)
              .then(({ body: data }) => {
                should.exist(data);
                data.openapi.should.equal(DEFAULT_DOCUMENT.openapi);
                data.servers[0].url.should.equal(`${basePath}`);
              }),
            supertest('https://localhost:' + (port + 2))
              .get('/openapi.json')
              .expect(200)
              .expect('Content-Type', /json/)
              .then(({ body: data }) => {
                should.exist(data);
                data.openapi.should.equal(DEFAULT_DOCUMENT.openapi);
                data.servers[0].url.should.equal(`https://localhost:${port + 2}`);
              })
          ]);
        });
      });
    });
  });

  describe('error handling', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const app = express();
    let server, spy;

    const api = new API();
    class Op1 extends Operation {
      constructor(resource, path, method) {
        super(resource, path, method, 'op1');
      }
      handler(req, res, next?) {
        spy(req, res, next);
      }
    }

    let r = new Resource({ name: 'Test' }, { '/a': { get: Op1 } });
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

    it('should return the specified rest error', function() {
      spy = chai.spy(function(req, res) {
        API.fireError(418);
      });
      return request
        .get('/tests/a')
        .expect(418)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.message.should.equal('');
          should.not.exist(data.info);
          spy.should.have.been.called.once();
        });
    });

    it('should return the specified rest error', function() {
      spy = chai.spy(function(req, res) {
        API.fireError(418);
      });
      return request
        .get('/tests/a')
        .expect(418)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.message.should.equal('');
          should.not.exist(data.info);
          spy.should.have.been.called.once();
        });
    });

    it('should return 500 as the default error', function() {
      spy = chai.spy(function(req, res) {
        throw new Error('bla bla bla');
      });
      return request
        .get('/tests/a')
        .expect(500)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.message.should.equal('internal');
          should.not.exist(data.info);
          spy.should.have.been.called.once();
        });
    });

    it('should return 405 if an unsupported method is called on a known path', function() {
      spy = chai.spy(function(req, res) {
        throw new Error('bla bla bla');
      });
      return request
        .post('/tests/a')
        .expect(405)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.message.should.equal('Method Not Allowed');
          data.info.should.be.a('string');
          spy.should.not.have.been.called();
        });
    });

    it('should convert nested ValidationErrors', function() {
      spy = chai.spy(function(req, res, next) {
        const error = new ValidationError('/', 'http://example.com', 'level1', [
          new ValidationError('/', 'http://example.com', 'level2-1', [new Error('level3')]),
          new ValidationError('/', 'http://example.com', 'level2-2')
        ]);
        next(error);
      });
      return request
        .get('/tests/a')
        .expect(400)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          // console.log(JSON.stringify(data, null, 2));
          data.info.errors[0].errors[0].type.should.equal('level3');
          spy.should.have.been.called.once();
        });
    });
  });

  describe('404 Error handling', function() {
    const port = 9999;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const api = new API();
    let spy, server;
    class Op1 extends Operation {
      constructor(resource, path, method) {
        super(resource, path, method, 'op1');
      }
      handler(req, res) {
        spy(req, res);
      }
    }
    let r = new Resource({ name: 'Test' }, { '/a': { get: Op1 } });
    api.addResource(r);

    before(async function() {
      server = await api.listen(port);
      return;
    });
    after(function() {
      server.close();
    });

    it('should return 404 if endpoint refers to an unknown path', function() {
      return request
        .get('/tests/unknown')
        .expect(404)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.message.should.equal('Not Found');
          data.info.should.be.a('string');
          data.info.should.contain('the requested resource cannot be found, check the endpoint URL');
        });
    });
  });

  describe('Scopes', function() {
    it('should return all the scopes as an array', function() {
      let s = new Scopes(['a.x', '-a.z']);
      s.toArray().should.have.length(2);
    });

    it('should create an empty scopes descriptor', function() {
      let s = new Scopes();
      s.match('a.x').should.equal(false);
      s.match(['a.x']).should.equal(false);
      s.match(new Scopes('+a.x')).should.equal(false);
      s.match('-a.x').should.equal(true);
      s.match(new Scopes('-a.x')).should.equal(true);
    });

    it('should use a negative wildcard scope when defined', function() {
      let s = new Scopes(['a', '-*.x']);
      s.match('a.x').should.equal(false);
      s.match('b.x').should.equal(false);
      s.match('a.y').should.equal(true);
      s.match('b.y').should.equal(false);

      s = new Scopes(['-a', '*.x']);
      s.match('a.x').should.equal(false);
      s.match('b.x').should.equal(true);
      s.match('a.y').should.equal(false);
      s.match('b.y').should.equal(false);
    });

    it('should throw if bad scopes are passed', function() {
      should.throw(function() {
        let s = new Scopes(['']);
      }, RangeError);
    });

    it('should filter scopes', function() {
      let ref1 = new Scopes(['a.*', '-a.x', '*.z']);
      ref1
        .filter('a.x a.y c.x c.y c.z')
        .toArray()
        .should.deep.equal(['a.y', 'c.z']);
      ref1
        .filter(['a.x', 'a.y', 'c.x', 'c.y', 'c.z'])
        .toArray()
        .should.deep.equal(['a.y', 'c.z']);
      ref1
        .filter(new Scopes(['a.x', 'a.y', 'c.x', 'c.y', 'c.z']))
        .toArray()
        .should.deep.equal(['a.y', 'c.z']);

      let ref2 = new Scopes(['*', '-*.x', '-c']);
      ref2
        .filter('a.x a.y c.x c.y c.z')
        .toArray()
        .should.deep.equal(['-*.x', 'a.y']);
      ref2
        .filter(['a.x', 'a.y', 'b.x', 'b.y', 'b.z'])
        .toArray()
        .should.deep.equal(['-*.x', 'a.y', 'b.y', 'b.z']);
      ref2
        .filter(new Scopes(['a', 'c']))
        .toArray()
        .should.deep.equal(['-*.x', 'a.*']);
      ref2
        .filter(new Scopes(['*']))
        .toArray()
        .should.deep.equal(['-*.x', '*.*', '-c.*']);
      ref2
        .filter(new Scopes(['*.x', '*.y']))
        .toArray()
        .should.deep.equal(['-*.x', '*.y']);
      ref2
        .filter('d.*')
        .toArray()
        .should.deep.equal(['-*.x', 'd.*']);

      let ref3 = new Scopes(['a', 'b', '-c']);
      ref3
        .filter('*.x')
        .toArray()
        .should.deep.equal(['a.x', 'b.x']);
      ref3
        .filter('*')
        .toArray()
        .should.deep.equal(['a.*', 'b.*']);
      ref3
        .filter('* -*.x')
        .toArray()
        .should.deep.equal(['a.*', 'b.*', '-*.x']);
      ref3
        .filter('d.*')
        .toArray()
        .should.deep.equal([]);

      let ref4 = new Scopes(['*.x', '-*.y']);
      ref4
        .filter('d.*')
        .toArray()
        .should.deep.equal(['-*.y', 'd.x']);

      let ref5 = new Scopes(['a']);
      ref5
        .filter('a.* -a.y')
        .toArray()
        .should.deep.equal(['a.*', '-a.y']);
    });
  });

  describe('schema', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    afterEach(function() {
      if (server) {
        server.close();
        server = undefined;
      }
    });

    it('should initialize missing document properties when registering a schema', function() {
      const api = new API();
      delete api.document.components;
      api.registerSchema('test', {
        type: 'object'
      });
      (api.document as any).components.schemas.test.should.deep.equal({ type: 'object' });
    });

    it('should be able to resolve an internal schema', function() {
      const spy = chai.spy((req, res) => {
        res.json({});
      });
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/op1_schema2' }
              }
            },
            required: true
          };
        }
        attach(api) {
          api.registerSchema('op1_schema1', {
            type: 'object',
            properties: {
              a: {
                type: 'boolean'
              },
              b: {
                type: 'integer'
              }
            },
            additionalProperties: false,
            required: ['a']
          });
          api.registerSchema('op1_schema2', {
            type: 'object',
            properties: {
              c: {
                type: 'string'
              },
              d: { $ref: 'op1_schema1' },
              e: { $ref: 'op1_schema1#/properties/b' }
            },
            additionalProperties: false,
            required: ['d']
          });
          super.attach(api);
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      api.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));

      return api.router().then(router => {
        const app = express();
        app.use(router);
        server = app.listen(port);

        return Promise.all([
          request
            .post('/tests/a')
            .send({})
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.type.should.equal('required');
              data.info.path.should.equal('body/d');
            }),
          request
            .post('/tests/a')
            .send({ d: {} })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.errors[0].type.should.equal('required');
              data.info.errors[0].path.should.equal('body/d/a');
            }),
          request
            .post('/tests/a')
            .send({ d: { a: true }, e: true })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.errors[0].type.should.equal('type');
              data.info.errors[0].path.should.equal('body/e');
            }),
          request
            .post('/tests/a')
            .send({ d: { a: true }, e: 1 })
            .expect(200)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
            })
        ]).then(() => {
          spy.should.have.been.called.once;
        });
      });
    });

    it('should be able to resolve dynamic schemas', function() {
      const spy = chai.spy((req, res) => {
        res.json({});
      });
      const api = new API();
      class Schema1 extends SchemaObject {
        async spec(): Promise<OpenAPIV3.SchemaObject> {
          return {
            type: 'object',
            properties: {
              a: {
                type: 'boolean'
              },
              b: {
                type: 'integer'
              }
            },
            additionalProperties: false,
            required: ['a']
          };
        }
      }
      class Schema2 extends SchemaObject {
        async spec(): Promise<OpenAPIV3.SchemaObject> {
          return {
            type: 'object',
            properties: {
              c: {
                type: 'string'
              },
              d: { $ref: 'op1_schema1' },
              e: { $ref: 'op1_schema1#/properties/b' }
            },
            additionalProperties: false,
            required: ['d']
          };
        }
      }
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/op1_schema2' }
              }
            },
            required: true
          };
        }
        attach(api) {
          api.registerDynamicSchema('op1_schema1', new Schema1());
          api.registerDynamicSchema('op1_schema2', new Schema2());
          super.attach(api);
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      api.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));

      return api.router().then(router => {
        const app = express();
        app.use(router);
        server = app.listen(port);

        return Promise.all([
          request
            .post('/tests/a')
            .send({})
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.type.should.equal('required');
              data.info.path.should.equal('body/d');
            }),
          request
            .post('/tests/a')
            .send({ d: {} })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.errors[0].type.should.equal('required');
              data.info.errors[0].path.should.equal('body/d/a');
            }),
          request
            .post('/tests/a')
            .send({ d: { a: true }, e: true })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.errors[0].type.should.equal('type');
              data.info.errors[0].path.should.equal('body/e');
            }),
          request
            .post('/tests/a')
            .send({ d: { a: true }, e: 1 })
            .expect(200)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
            })
        ]).then(() => {
          spy.should.have.been.called.once;
        });
      });
    });

    it('should fail if an external schema cannot be retrieved (1)', async function() {
      const spy = chai.spy((req, res) => {
        res.json({});
      });
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            content: {
              'application/json': {
                schema: { $ref: `http://noresolve.vivocha.com/aaa` }
              }
            },
            required: true
          };
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      const app = express();
      server = app.listen(port);

      api.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));
      const err = await api.router().should.be.rejectedWith(ParserError, 'retriever');
      err.errors[0].message.should.match(/noresolve.vivocha.com/);
    });

    it('should fail if an external schema cannot be retrieved (2)', async function() {
      const spy = chai.spy((req, res) => {
        res.json({});
      });
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            content: {
              'application/json': {
                schema: { $ref: `${basePath}/aaa` }
              }
            },
            required: true
          };
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      const app = express();
      app.get('/aaa', (req, res) => res.status(499).end());
      server = app.listen(port);

      api.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));
      const err = await api.router().should.be.rejectedWith(ParserError, 'retriever');
      err.errors[0].should.be.instanceOf(RetrieverError);
      err.errors[0].originalError.should.be.instanceOf(RESTError);
    });

    it('should be able to resolve an external schema', function() {
      const spy = chai.spy((req, res) => {
        res.json({});
      });
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            content: {
              'application/json': {
                schema: { $ref: `${basePath}/aaa` }
              }
            },
            required: true
          };
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      const app = express();
      app.get('/aaa', (req, res) =>
        res.json({
          type: 'object',
          properties: {
            h: {
              type: 'boolean'
            },
            i: {
              type: 'integer'
            }
          },
          additionalProperties: false,
          required: ['h']
        })
      );
      server = app.listen(port);

      api.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));

      return api.router().then(router => {
        app.use(router);

        return Promise.all([
          request
            .post('/tests/a')
            .send({})
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.type.should.equal('required');
              data.info.path.should.equal('body/h');
            }),
          request
            .post('/tests/a')
            .send({ h: 1 })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.errors[0].type.should.equal('type');
              data.info.errors[0].path.should.equal('body/h');
            }),
          request
            .post('/tests/a')
            .send({ h: true, i: true })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('ValidationError');
              data.info.errors[0].type.should.equal('type');
              data.info.errors[0].path.should.equal('body/i');
            }),
          request
            .post('/tests/a')
            .send({ h: true, i: 1 })
            .expect(200)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
            })
        ]).then(() => {
          spy.should.have.been.called.once;
        });
      });
    });

    it('should not create a Schema.read operation if no schema is registered', function() {
      const api = new API();
      delete api.document.components;
      return api.router().then(router => {
        const app = express();
        app.use(router);
        server = app.listen(port);

        return request
          .get('/openapi.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            should.not.exist(data.paths['/schemas/{id}']);
          });
      });
    });

    it('should create a Schema.read operation if at least a schema is registered', function() {
      const api = new API();
      api.registerSchema('test', {
        type: 'object'
      });
      return api.router().then(router => {
        const app = express();
        app.use(router);
        server = app.listen(port);

        return request
          .get('/openapi.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            should.exist(data.paths['/schemas/{id}']);
            data.paths['/schemas/{id}'].get.operationId.should.equal('Schema.read');
          });
      });
    });

    it('should return a registered schema by id via the Schema.read operation', function() {
      const api = new API();
      const schema: OpenAPIV3.SchemaObject = {
        type: 'object',
        additionalProperties: false
      };
      api.registerSchema('test', schema);
      return api.router().then(router => {
        const app = express();
        app.use(router);
        server = app.listen(port);

        return request
          .get('/schemas/test')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal(schema);
          });
      });
    });

    it('should return 404 if a requested schema is not registered', function() {
      const api = new API();
      const schema: OpenAPIV3.SchemaObject = {
        type: 'object',
        additionalProperties: false
      };
      api.registerSchema('test', schema);
      return api.router().then(router => {
        const app = express();
        app.use(router);
        server = app.listen(port);

        return request.get('/schemas/abcd').expect(404);
      });
    });
  });

  describe('openapi spec for an API', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    before(async function() {
      server = await simpleAPI.listen(port);
      return server;
    });
    after(function() {
      if (server) {
        server.close();
        server = undefined;
      }
    });
    it('should return a complete and clean OpenAPI spec for a defined API instance', async function() {
      const expectedSpec = {
        openapi: '3.0.2',
        info: {
          title: 'REST API',
          version: '1.0.0'
        },
        components: {
          schemas: {
            errorResponse: {
              type: 'object',
              properties: {
                error: {
                  type: 'integer',
                  minimum: 100
                },
                message: {
                  type: 'string'
                },
                info: {
                  type: 'string'
                }
              },
              required: ['error', 'message']
            },
            op1_schema1: {
              type: 'object',
              properties: {
                a: {
                  type: 'boolean'
                },
                b: {
                  type: 'integer'
                }
              },
              additionalProperties: false,
              required: ['a']
            },
            op1_schema2: {
              type: 'object',
              properties: {
                c: {
                  type: 'string'
                },
                d: {
                  $ref: '#/components/schemas/op1_schema1'
                },
                e: {
                  $ref: '#/components/schemas/op1_schema1/properties/b'
                }
              },
              additionalProperties: false,
              required: ['d']
            }
          },
          responses: {
            defaultError: {
              description: 'Default/generic error response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            },
            notFound: {
              description: 'The requested/specified resource was not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            }
          },
          parameters: {
            id: {
              description: 'Unique identifier of the resource',
              name: 'id',
              in: 'path',
              schema: {
                type: 'string'
              },
              required: true
            }
          }
        },
        paths: {
          '/tests/a': {
            post: {
              operationId: 'Test.op1',
              tags: ['Test'],
              responses: {
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/op1_schema2'
                    }
                  }
                },
                required: true
              }
            }
          },
          '/schemas/{id}': {
            get: {
              operationId: 'Schema.read',
              tags: ['Schema'],
              responses: {
                '200': {
                  description: 'The requested JSON Schema',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object'
                      }
                    }
                  }
                },
                '404': {
                  $ref: '#/components/responses/notFound'
                },
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              summary: 'Retrieve a JSON Schema by id',
              parameters: [
                {
                  $ref: '#/components/parameters/id'
                }
              ]
            }
          }
        },
        tags: [
          {
            name: 'Test'
          },
          {
            name: 'Schema'
          }
        ],
        servers: [
          {
            url: basePath
          }
        ]
      };
      return request
        .get('/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal(expectedSpec);
        });
    });
  });
  describe('openapi spec for another API', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    before(async function() {
      server = await simpleAPI2.listen(port);
      return server;
    });
    after(function() {
      if (server) {
        server.close();
        server = undefined;
      }
    });
    it('should return a complete and clean OpenAPI spec for a defined API instance with cross references between schemas', async function() {
      const expectedSpec = {
        openapi: '3.0.2',
        info: {
          title: 'REST API',
          version: '1.0.0'
        },
        components: {
          schemas: {
            errorResponse: {
              type: 'object',
              properties: {
                error: {
                  type: 'integer',
                  minimum: 100
                },
                message: {
                  type: 'string'
                },
                info: {
                  type: 'string'
                }
              },
              required: ['error', 'message']
            },
            op1_schema1: {
              type: 'object',
              properties: {
                a: {
                  type: 'boolean'
                },
                b: {
                  type: 'integer'
                }
              },
              additionalProperties: false,
              required: ['a']
            },
            op1_schema1_defA: {
              type: 'string'
            },

            op1_schema1_defC: {
              type: 'object',
              properties: {
                propA: { $ref: '#/components/schemas/op1_schema1_defA' }
              }
            }
          },
          responses: {
            defaultError: {
              description: 'Default/generic error response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            },
            notFound: {
              description: 'The requested/specified resource was not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            }
          },
          parameters: {
            id: {
              description: 'Unique identifier of the resource',
              name: 'id',
              in: 'path',
              schema: {
                type: 'string'
              },
              required: true
            }
          }
        },
        paths: {
          '/things/a': {
            post: {
              operationId: 'thing.anOperation',
              tags: ['thing'],
              responses: {
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/op1_schema1'
                    }
                  }
                },
                required: true
              }
            }
          },
          '/schemas/{id}': {
            get: {
              operationId: 'Schema.read',
              tags: ['Schema'],
              responses: {
                '200': {
                  description: 'The requested JSON Schema',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object'
                      }
                    }
                  }
                },
                '404': {
                  $ref: '#/components/responses/notFound'
                },
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              summary: 'Retrieve a JSON Schema by id',
              parameters: [
                {
                  $ref: '#/components/parameters/id'
                }
              ]
            }
          }
        },
        tags: [
          {
            name: 'thing'
          },
          {
            name: 'Schema'
          }
        ],
        servers: [
          {
            url: basePath
          }
        ]
      };
      return request
        .get('/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal(expectedSpec);
        });
    });
  });
  describe('openapi spec for an API with custom info', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    before(async function() {
      server = await simpleAPI3.listen(port);
      return server;
    });
    after(function() {
      if (server) {
        server.close();
        server = undefined;
      }
    });
    it('should return a complete and clean OpenAPI spec for a defined API instance with cross references and custom info', async function() {
      const expectedSpec = {
        openapi: '3.0.2',
        info: {
          title: 'simpleAPI3',
          version: '1.1.1',
          contact: { email: 'me@test.org' }
        },
        components: {
          schemas: {
            errorResponse: {
              type: 'object',
              properties: {
                error: {
                  type: 'integer',
                  minimum: 100
                },
                message: {
                  type: 'string'
                },
                info: {
                  type: 'string'
                }
              },
              required: ['error', 'message']
            },
            op1_schema1: {
              type: 'object',
              properties: {
                a: {
                  type: 'boolean'
                },
                b: {
                  type: 'integer'
                }
              },
              additionalProperties: false,
              required: ['a']
            },
            op1_schema1_defA: {
              type: 'string'
            },

            op1_schema1_defC: {
              type: 'object',
              properties: {
                propA: { $ref: '#/components/schemas/op1_schema1_defA' }
              }
            },
            op1_schema2: {
              type: 'object',
              properties: {
                c: {
                  $ref: '#/components/schemas/op1_schema1_defC'
                },
                d: {
                  $ref: '#/components/schemas/op1_schema1'
                },
                e: {
                  $ref: '#/components/schemas/op1_schema1/properties/b'
                }
              },
              additionalProperties: false,
              required: ['d']
            }
          },
          responses: {
            defaultError: {
              description: 'Default/generic error response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            },
            notFound: {
              description: 'The requested/specified resource was not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            }
          },
          parameters: {
            id: {
              description: 'Unique identifier of the resource',
              name: 'id',
              in: 'path',
              schema: {
                type: 'string'
              },
              required: true
            }
          }
        },
        paths: {
          '/things/foo': {
            post: {
              operationId: 'thing.anOperation',
              tags: ['thing'],
              responses: {
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/op1_schema2'
                    }
                  }
                },
                required: true
              }
            }
          },
          '/schemas/{id}': {
            get: {
              operationId: 'Schema.read',
              tags: ['Schema'],
              responses: {
                '200': {
                  description: 'The requested JSON Schema',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object'
                      }
                    }
                  }
                },
                '404': {
                  $ref: '#/components/responses/notFound'
                },
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              summary: 'Retrieve a JSON Schema by id',
              parameters: [
                {
                  $ref: '#/components/parameters/id'
                }
              ]
            }
          }
        },
        tags: [
          {
            name: 'thing'
          },
          {
            name: 'Schema'
          }
        ],
        servers: [
          {
            url: basePath
          }
        ]
      };
      return request
        .get('/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal(expectedSpec);
        });
    });
  });
  describe('openapi spec for an API with nested definitions/schema/definitions refs', function() {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    before(async function() {
      server = await simpleAPI4.listen(port);
      return server;
    });
    after(function() {
      if (server) {
        server.close();
        server = undefined;
      }
    });
    it('should return a complete and clean OpenAPI spec with correctly resolved refs', async function() {
      const expectedSpec = {
        openapi: '3.0.2',
        info: {
          title: 'simpleAPI4',
          version: '1.1.1',
          contact: { email: 'me@test.org' }
        },
        components: {
          schemas: {
            errorResponse: {
              type: 'object',
              properties: {
                error: {
                  type: 'integer',
                  minimum: 100
                },
                message: {
                  type: 'string'
                },
                info: {
                  type: 'string'
                }
              },
              required: ['error', 'message']
            },
            op1_schema1: {
              type: 'object',
              properties: {
                a: {
                  type: 'boolean'
                },
                b: {
                  type: 'integer'
                }
              },
              additionalProperties: false,
              required: ['a']
            },
            op1_schema1_defA_settings: {
              type: 'object'
            },
            op1_schema2: {
              type: 'object',
              properties: {
                c: {
                  $ref: '#/components/schemas/op1_schema1_defA_settings'
                },
                d: {
                  $ref: '#/components/schemas/op1_schema1'
                },
                e: {
                  $ref: '#/components/schemas/op1_schema1/properties/b'
                }
              },
              additionalProperties: false,
              required: ['d']
            }
          },
          responses: {
            defaultError: {
              description: 'Default/generic error response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            },
            notFound: {
              description: 'The requested/specified resource was not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/errorResponse'
                  }
                }
              }
            }
          },
          parameters: {
            id: {
              description: 'Unique identifier of the resource',
              name: 'id',
              in: 'path',
              schema: {
                type: 'string'
              },
              required: true
            }
          }
        },
        paths: {
          '/things/foo': {
            post: {
              operationId: 'thing.anOperation',
              tags: ['thing'],
              responses: {
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/op1_schema2'
                    }
                  }
                },
                required: true
              }
            }
          },
          '/schemas/{id}': {
            get: {
              operationId: 'Schema.read',
              tags: ['Schema'],
              responses: {
                '200': {
                  description: 'The requested JSON Schema',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object'
                      }
                    }
                  }
                },
                '404': {
                  $ref: '#/components/responses/notFound'
                },
                default: {
                  $ref: '#/components/responses/defaultError'
                }
              },
              summary: 'Retrieve a JSON Schema by id',
              parameters: [
                {
                  $ref: '#/components/parameters/id'
                }
              ]
            }
          }
        },
        tags: [
          {
            name: 'thing'
          },
          {
            name: 'Schema'
          }
        ],
        servers: [
          {
            url: basePath
          }
        ]
      };
      return request
        .get('/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          // console.dir(data, { colors: true, depth: 20 });
          data.should.deep.equal(expectedSpec);
        });
    });
  });
});
