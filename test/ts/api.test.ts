import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as spies from 'chai-spies';
import * as express from 'express';
import { OpenAPIV3 } from 'openapi-police';
import * as pem from 'pem';
import * as supertest from 'supertest';
import { API } from '../../dist/api';
import { Operation } from '../../dist/operation';
import { Resource } from '../../dist/resource';
import { Scopes } from '../../dist/scopes';

const should = chai.should();
chai.use(spies);
chai.use(chaiAsPromised);


describe('API', function () {

  describe('constructor', function () {

    it('should fail to create an API instance if an invalid version is specified', function () {
      (function () { new API({ version: true } as any as OpenAPIV3.InfoObject) }).should.throw(Error, 'Invalid version');
      (function () { new API({ version: 'a' } as any as OpenAPIV3.InfoObject) }).should.throw(Error, 'Invalid version');
      (function () { new API({ version: 1 } as any as OpenAPIV3.InfoObject) }).should.throw(Error, 'Invalid version');
      (function () { new API({ version: '1' } as any as OpenAPIV3.InfoObject) }).should.throw(Error, 'Invalid version');
      (function () { new API({ version: '1.0' } as any as OpenAPIV3.InfoObject) }).should.throw(Error, 'Invalid version');
      (function () { new API() }).should.not.throw;
    });

    it('should create an API instance', function () {
      let api = new API();
      api.document.openapi.should.equal('3.0.2')
      api.document.info.version.should.equal('1.0.0');
      api.document.info.title.should.equal('REST API');
    });
  });

  describe('router', function () {

    it('should return an Expressjs router', function () {
      let api = new API();
      return api.router().then(router => {
        router.should.be.a('function');
      });
    });

    it('should return the same object when called twice', function () {
      let api = new API();
      return api.router().then(router1 => {
        return api.router().then(router2 => {
          router1.should.equal(router2);
        });
      });
    });

  });

  describe('plain api (no resources)', function () {

    describe('/openapi.json', function () {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const api = new API();
      const app = express();
      let server;

      before(function () {
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
  
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function () {
        server.close();
      });

      it('should fail if the request is missing the Host header', function () {
        let app2 = express();
        let server2;
        return api.router().then(router => {
          app2.use((req, res, next) => {
            delete req.headers.host;
            next();
          });
          app2.use(router);
          server2 = app2.listen(port + 1);
          return supertest('http://localhost:' + (port + 1))
            .get('/swagger.json')
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.info.should.match(/Missing Host/);
            });
        }).then(() => {
          server2.close();
        }, err => {
          server2.close();
          throw err;
        });
      });

      it('should return a the default swagger file', function () {
        return request
          .get('/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.swagger.should.equal('2.0');
            data.host.should.equal(host);
            data.basePath.should.equal('/');
            should.not.exist(data.id);
            should.not.exist(data.tags);
          });
      });

      it('should normalize oauth2 urls in security definitions', function () {
        return request
          .get('/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.securityDefinitions.access_code.tokenUrl.should.equal(basePath + '/token');
            data.securityDefinitions.implicit.authorizationUrl.should.equal(basePath + '/a/b/authorize');
          });
      });

    });

  });

  describe('attach', function () {

    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const api = new API({ version: '3.2.1', title: 'test' });
    const app = express();
    const r = express.Router();
    let server;

    before(function () {
      app.use(r);
      return api.attach(r).then(router => {
        app.use(router);
        server = app.listen(port);
      });
    });

    after(function () {
      server.close();
    });

    it('should attach the api on /v{major version} and reflect that in the swagger', function () {
      return request
        .get('/v3/swagger.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          should.exist(data);
          data.swagger.should.equal('2.0');
          data.host.should.equal(host);
          data.basePath.should.equal('/v3/');
        });
    });

    it('should attach another api version and reflect that in the swagger', function () {
      const api2 = new API({ version: '4.0.0', title: 'test' });

      return api2.attach(r).then(() => {
        return request
          .get('/v4/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.swagger.should.equal('2.0');
            data.host.should.equal(host);
            data.basePath.should.equal('/v4/');
          });
      });
    });

    it('should attach another api with the same version which will handle resources to handled by the fist one', function () {
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

  describe('listen', function () {

    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server1;
    let server2;

    afterEach(function () {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      if (server1) {
        server1.close();
      }
      if (server2) {
        server2.close();
      }
    });

    it('should fail if no ports are specified', function () {
      const api = new API({ version: '3.2.1', title: 'test' });
      return api.listen(undefined as any as number).then(() => {
        throw new Error('should not get here');
      }, err => {
        err.should.be.instanceOf(Error);
        err.message.should.match(/no listen ports specified/);
      });
    });

    it('should fail if no https options are specified', function () {
      const api = new API({ version: '3.2.1', title: 'test' });
      api.listen(0, 1).then(() => {
        throw new Error('should not get here')
      }, err => true);
    });

    it('should create an api server listening to http on the requested port', function () {
      const api = new API({ version: '3.2.1', title: 'test' });
      return api.listen(port).then(server => {
        server1 = server;
        return request
          .get('/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            should.exist(data);
            data.swagger.should.equal('2.0');
            data.host.should.equal(host);
            data.basePath.should.equal('/');
            data.schemes.should.deep.equal(['http']);
          });
      });
    });

    it('should create an api server listening to https on the requested port', function () {
      return new Promise((resolve, reject) => {
        pem.createCertificate({ days: 1, selfSigned: true }, function (err, keys) {
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
            .get('/swagger.json')
            .expect(200)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.swagger.should.equal('2.0');
              data.host.should.equal(host);
              data.basePath.should.equal('/');
              data.schemes.should.deep.equal(['https']);
            });
        });
      });


    });

    it('should create an api server listening to both http and https on the requested ports', function () {
      return new Promise((resolve, reject) => {
        pem.createCertificate({ days: 1, selfSigned: true }, function (err, keys) {
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
              .get('/swagger.json')
              .expect(200)
              .expect('Content-Type', /json/)
              .then(({ body: data }) => {
                should.exist(data);
                data.swagger.should.equal('2.0');
                data.host.should.equal(host);
                data.basePath.should.equal('/');
                data.schemes.should.deep.equal(['https', 'http']);
              }),
            supertest('https://localhost:' + (port + 2))
              .get('/swagger.json')
              .expect(200)
              .expect('Content-Type', /json/)
              .then(({ body: data }) => {
                should.exist(data);
                data.swagger.should.equal('2.0');
                data.host.should.equal('localhost:' + (port + 2));
                data.basePath.should.equal('/');
                data.schemes.should.deep.equal(['https', 'http']);
              })
          ]);
        });
      });


    });

  });

  describe('error handling', function () {

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
      handler(req, res) {
        spy(req, res);
      }
    }

    let r = new Resource({ name: 'Test' }, { '/a': { get: Op1 } });
    api.addResource(r);

    before(function () {
      return api.router().then(router => {
        app.use(router);
        server = app.listen(port);
      });
    });

    after(function () {
      server.close();
    });

    it('should return the specified rest error', function () {
      spy = chai.spy(function (req, res) {
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

    it('should return the specified rest error', function () {
      spy = chai.spy(function (req, res) {
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

    it('should return 500 as the default error', function () {
      spy = chai.spy(function (req, res) {
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

    it('should return 405 if an unsupported method is called on a known path', function () {
      spy = chai.spy(function (req, res) {
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
  });

  describe('404 Error handling', function () {
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

    before(async function () {
      server = await api.listen(port);
      return;
    });
    after(function(){
      server.close();
    })

    it('should return 404 if endpoint refers to an unknown path', function () {
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
  describe('Scopes', function () {

    it('should return all the scopes as an array', function () {
      let s = new Scopes(['a.x', '-a.z']);
      s.toArray().should.have.length(2);
    });

    it('should create an empty scopes descriptor', function () {
      let s = new Scopes();
      s.match('a.x').should.equal(false);
      s.match(['a.x']).should.equal(false);
      s.match(new Scopes('+a.x')).should.equal(false);
      s.match('-a.x').should.equal(true);
      s.match(new Scopes('-a.x')).should.equal(true);
    });

    it('should use a negative wildcard scope when defined', function () {
      let s = new Scopes([ 'a', '-*.x']);
      s.match('a.x').should.equal(false);
      s.match('b.x').should.equal(false);
      s.match('a.y').should.equal(true);
      s.match('b.y').should.equal(false);

      s = new Scopes([ '-a', '*.x']);
      s.match('a.x').should.equal(false);
      s.match('b.x').should.equal(true);
      s.match('a.y').should.equal(false);
      s.match('b.y').should.equal(false);
    });

    it('should throw if bad scopes are passed', function () {
      should.throw(function () { let s = new Scopes(['']); }, RangeError);
    });

    it('should filter scopes', function () {
      let ref1 = new Scopes(['a.*', '-a.x', '*.z']);
      ref1.filter('a.x a.y c.x c.y c.z').toArray().should.deep.equal(['a.y', 'c.z']);
      ref1.filter(['a.x', 'a.y', 'c.x', 'c.y', 'c.z']).toArray().should.deep.equal(['a.y', 'c.z']);
      ref1.filter(new Scopes(['a.x', 'a.y', 'c.x', 'c.y', 'c.z'])).toArray().should.deep.equal(['a.y', 'c.z']);

      let ref2 = new Scopes(['*', '-*.x', '-c']);
      ref2.filter('a.x a.y c.x c.y c.z').toArray().should.deep.equal(['-*.x','a.y']);
      ref2.filter(['a.x', 'a.y', 'b.x', 'b.y', 'b.z']).toArray().should.deep.equal(['-*.x', 'a.y', 'b.y', 'b.z']);
      ref2.filter(new Scopes(['a', 'c'])).toArray().should.deep.equal(['-*.x', 'a.*']);
      ref2.filter(new Scopes(['*'])).toArray().should.deep.equal(['-*.x', '*.*', '-c.*']);
      ref2.filter(new Scopes(['*.x', '*.y'])).toArray().should.deep.equal(['-*.x','*.y']);
      ref2.filter('d.*').toArray().should.deep.equal(['-*.x', 'd.*']);

      let ref3 = new Scopes(['a', 'b', '-c']);
      ref3.filter('*.x').toArray().should.deep.equal(['a.x', 'b.x']);
      ref3.filter('*').toArray().should.deep.equal(['a.*', 'b.*']);
      ref3.filter('* -*.x').toArray().should.deep.equal(['a.*', 'b.*', '-*.x']);
      ref3.filter('d.*').toArray().should.deep.equal([]);

      let ref4 = new Scopes(['*.x', '-*.y']);
      ref4.filter('d.*').toArray().should.deep.equal(['-*.y','d.x']);

      let ref5 = new Scopes(['a']);
      ref5.filter('a.* -a.y').toArray().should.deep.equal(['a.*','-a.y']);
    });

  });

  describe('schema', function () {

    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    afterEach(function () {
      server.close();
    });

    it('should be able to resolve an internal schema', function () {
      debugger;
      const spy = chai.spy((req, res) => { res.json({}) });
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            "content": {
              "application/json": {
                "schema": { $ref: '#/components/schemas/op1_schema2' }
              }
            },
            "required": true
          };
        }
        attach(api) {
          api.registerSchema('op1_schema1', {
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
            "required": ["a"]
          });
          api.registerSchema('op1_schema2', {
            "type": "object",
            "properties": {
              "c": {
                "type": "string"
              },
              "d": { $ref: '#/components/schemas/op1_schema1' },
              "e": { $ref: '#/components/schemas/op1_schema1#/properties/b' }
            },
            "additionalProperties": false,
            "required": ["d"]
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
              data.message.should.equal('required');
              data.info.should.equal('body/d');
            }),
          request
            .post('/tests/a')
            .send({ d: {} })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('required');
              data.info.should.equal('body/d/a');
            }),
          request
            .post('/tests/a')
            .send({ d: { a: true }, e: true })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('type');
              data.info.should.equal('body/e');
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

    it('should be able to resolve an external schema', function () {
      const spy = chai.spy((req, res) => { res.json({}) });
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super(resource, path, method, 'op1');
          this.info.requestBody = {
            "content": {
              "application/json": {
                "schema": { $ref: `${basePath}/aaa` }
              }
            },
            "required": true
          };
        }
        handler(req, res) {
          spy(req, res);
        }
      }

      const app = express();
      app.get('/aaa', (req, res) => res.json({
        "type": "object",
        "properties": {
          "h": {
            "type": "boolean"
          },
          "i": {
            "type": "integer"
          }
        },
        "additionalProperties": false,
        "required": ["h"]
      }));
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
              data.message.should.equal('required');
              data.info.should.equal('body/h');
            }),
          request
            .post('/tests/a')
            .send({ h: 1 })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('type');
              data.info.should.equal('body/h');
            }),
          request
            .post('/tests/a')
            .send({ h: true, i: true })
            .expect(400)
            .expect('Content-Type', /json/)
            .then(({ body: data }) => {
              should.exist(data);
              data.message.should.equal('type');
              data.info.should.equal('body/i');
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
      })
    });

  });

});
