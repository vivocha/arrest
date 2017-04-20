var chai = require('chai')
  , spies = require('chai-spies')
  , should = chai.should()
  , supertest = require('supertest')
  , pem = require('pem')
  , express = require('express')
  , Scopes = require('../dist/scopes').Scopes
  , API = require('../dist/api').API
  , Resource = require('../dist/resource').Resource
  , Operation = require('../dist/operation').Operation


chai.use(spies);

describe('API', function() {

  describe('constructor', function() {

    it('should fail to create an API instance if an invalid version is specified', function() {
      (function() { new API({ info: { version: true }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: 'a' }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: 1 }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: '1' }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: '1.0' }}) }).should.throw(Error, 'invalid_version');
      (function() { new API() }).should.not.throw();
    });

    it('should create an API instance', function() {
      let api = new API();
      api.swagger.should.equal('2.0')
      api.info.version.should.equal('1.0.0')
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

    describe('swagger disabled', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const api = new API(null, { swagger: false });
      const app = express();
      let server;

      before(function() {
        api.securityDefinitions = {
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
          "": {}
        };
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });

      it('should return a the default swagger file', function() {
        return request
          .get('/swagger.json')
          .expect(404);
      });

    });

    describe('/swagger.json', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const api = new API();
      const app = express();
      let server;

      before(function() {
        api.securityDefinitions = {
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
          "": {}
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

      it('should return a the default swagger file', function() {
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

      it('should normalize oauth2 urls in security definitions', function() {
        delete api.schemes;
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

    describe('/schemas/{id}', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const api = new API();
      const app = express();
      const schema1 = { a: true, b: 2 };
      const schema2 = { c: 'd', e: [] };
      let server;

      before(function() {
        api.registerSchema('abc', schema1);
        api.registerSchema('def', (req, res) => res.json(schema2));
        return api.router().then(router => {
          app.use(router);
          server = app.listen(port);
        });
      });

      after(function() {
        server.close();
      });

      it('should return 404 when an unknown schema is requested', function() {
        return request
          .get('/schemas/aaa')
          .expect(404);
      });

      it('should return the requested static schema', function() {
        return request
          .get('/schemas/abc')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal(schema1);
          });
      });

      it('should return the requested dynamic schema', function() {
        return request
          .get('/schemas/def')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal(schema2);
          });
      });
    });

  });

  describe('attach', function() {

    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const api = new API({ info: { version: '3.2.1' }});
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

    it('should attach the api on /v{major version} and reflect that in the swagger', function() {
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

    it('should attach another api version and reflect that in the swagger', function() {
      const api2 = new API({ info: { version: '4.0.0' }});

      return api2.attach(r).then(() => {
        return request
          .get('/v4/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({body: data}) => {
            should.exist(data);
            data.swagger.should.equal('2.0');
            data.host.should.equal(host);
            data.basePath.should.equal('/v4/');
          });
      });
    });

    it('should attach another api with the same version which will handle resources to handled by the fist one', function() {
      const api3 = new API({ info: { version: '3.2.2' }});
      api3.addResource(new Resource({ routes: { '/': { get: (req, res) => res.json({ result: 10 }) } } } ));

      return api3.attach(r).then(() => {
        return request
          .get('/v3/resources')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({body: data}) => {
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
      const api = new API({ info: { version: '3.2.1' }});
      return api.listen().then(() => {
        should.fail();
      }, err => {
        err.should.be.instanceOf(Error);
        err.message.should.match(/no listen ports specified/);
      });
    });

    it('should fail if no https options are specified', function() {
      const api = new API({ info: { version: '3.2.1' }});
      api.listen(0, 1).then(() => should.fail(), err => true);
    });

    it('should create an api server listening to http on the requested port', function() {
      const api = new API({ info: { version: '3.2.1' }});
      return api.listen(port).then(server => {
        server1 = server;
        return request
          .get('/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({body: data}) => {
            should.exist(data);
            data.swagger.should.equal('2.0');
            data.host.should.equal(host);
            data.basePath.should.equal('/');
            data.schemes.should.deep.equal([ 'http' ]);
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
      }).then(keys => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        const api = new API({ info: { version: '3.2.1' }});
        return api.listen(0, port, { key: keys.serviceKey, cert: keys.certificate }).then(server => {
          server1 = server;
          return supertest('https://' + host)
            .get('/swagger.json')
            .expect(200)
            .expect('Content-Type', /json/)
            .then(({body: data}) => {
              should.exist(data);
              data.swagger.should.equal('2.0');
              data.host.should.equal(host);
              data.basePath.should.equal('/');
              data.schemes.should.deep.equal([ 'https' ]);
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
      }).then(keys => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        const api = new API({ info: { version: '3.2.1' }});
        return api.listen(port, port + 2, { key: keys.serviceKey, cert: keys.certificate }).then(servers => {
          server1 = servers[0];
          server2 = servers[1];
          return Promise.all([
            request
              .get('/swagger.json')
              .expect(200)
              .expect('Content-Type', /json/)
              .then(({body: data}) => {
                should.exist(data);
                data.swagger.should.equal('2.0');
                data.host.should.equal(host);
                data.basePath.should.equal('/');
                data.schemes.should.deep.equal([ 'https', 'http' ]);
              }),
            supertest('https://localhost:' + (port + 2))
              .get('/swagger.json')
              .expect(200)
              .expect('Content-Type', /json/)
              .then(({body: data}) => {
                should.exist(data);
                data.swagger.should.equal('2.0');
                data.host.should.equal('localhost:' + (port + 2));
                data.basePath.should.equal('/');
                data.schemes.should.deep.equal([ 'https', 'http' ]);
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
        super('op1', resource, path, method);
      }
      handler(req, res) {
        spy(req, res);
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
  });

  describe('Scopes', function() {

    it('should return all the scopes as an array', function() {
      let s = new Scopes([ 'a.x', '-a.z' ]);
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

    it('should throw if bad scopes are passed', function() {
      should.throw(function() { let s = new Scopes(['']); }, RangeError);
    });

    it('should filter scopes', function() {
      let ref = new Scopes([ 'a.*', '-a.x', '*.z' ]);
      ref.filter('a.x a.y c.x c.y c.z').toArray().should.deep.equal(['a.y', 'c.z']);
      ref.filter([ 'a.x', 'a.y', 'c.x', 'c.y', 'c.z' ]).toArray().should.deep.equal(['a.y', 'c.z']);
      ref.filter(new Scopes([ 'a.x', 'a.y', 'c.x', 'c.y', 'c.z' ])).toArray().should.deep.equal(['a.y', 'c.z']);
    });

  });


  describe('schema', function() {

    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    let server;

    afterEach(function() {
      server.close();
    });

    it('should be able to resolve an internal schema', function() {
      const spy = chai.spy((req, res) => { res.json({})});
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super('op1', resource, path, method);
          this.setInfo({
            parameters: [
              {
                "name": "aaa",
                "in": "body",
                "schema": { $ref: 'schemas/op1_schema2' },
                "required": true
              }
            ]
          });
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
              "d": { $ref: 'op1_schema1' },
              "e": { $ref: 'op1_schema1#/properties/b' }
            },
            "additionalProperties": false,
            "required": [ "d" ]
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
          spy.should.have.been.called.once();
        });
      });

    });

    it('should be able to resolve an external schema', function() {
      const spy = chai.spy((req, res) => { res.json({})});
      const api = new API();
      class Op1 extends Operation {
        constructor(resource, path, method) {
          super('op1', resource, path, method);
          this.setInfo({
            parameters: [
              {
                "name": "aaa",
                "in": "body",
                "schema": { $ref: `${basePath}/aaa` },
                "required": true
              }
            ]
          });
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
          spy.should.have.been.called.once();
        });
      })
    });

  });

});
