var chai = require('chai')
  , spies = require('chai-spies')
  , should = chai.should()
  , supertest = require('supertest')
  , express = require('express')
  , API = require('../dist/api').API
  , Resource = require('../dist/resource').Resource
  , Operation = require('../dist/operation').Operation


chai.use(spies);

describe('API', function() {

  describe('constructor', function() {

    it('should fail to create an API instance if no version or an invalid version is specified', function() {
      (function() { new API() }).should.throw(Error, /Cannot convert/);
      (function() { new API({}) }).should.throw(Error, /Cannot read/);
      (function() { new API({ info: { }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: true }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: 'a' }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: 1 }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: '1' }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: '1.0' }}) }).should.throw(Error, 'invalid_version');
      (function() { new API({ info: { version: '1.0.0' }}) }).should.not.throw();
    });

    it('should create an API instance', function() {
      let api = new API({ info: { version: '1.0.0' }});
      api.swagger.should.equal('2.0')
      api.info.version.should.equal('1.0.0')
    });
  });

  describe('router', function() {

    it('should return an Expressjs router', function() {
      let api = new API({ info: { version: '1.0.0' }});
      return api.router().then(router => {
        router.should.be.a('function');
      });
    });

    it('should return the same object when called twice', function() {
      let api = new API({ info: { version: '1.0.0' }});
      return api.router().then(router1 => {
        return api.router().then(router2 => {
          router1.should.equal(router2);
        });
      });
    });

  });

  describe('plain api (no resources)', function() {

    describe('/swagger.json', function() {

      const port = 9876;
      const host = 'localhost:' + port;
      const basePath = 'http://' + host;
      const request = supertest(basePath);
      const api = new API({ info: { version: '1.0.0' }});
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
            data.basePath.should.equal('');
            data.id.should.equal('https://' + host + '/swagger.json#');
            should.not.exist(data.tags);
          });
      });

      it('should return a swagger with an http basePath if that\'s the only scheme', function() {
        api.schemes = [ 'http' ];
        return request
          .get('/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.id.should.equal('http://' + host + '/swagger.json#');
          });
      });

      it('should return a swagger with an http basePath if no scheme is defined (empty array)', function() {
        api.schemes = [ ];
        return request
          .get('/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.id.should.equal('http://' + host + '/swagger.json#');
          });
      });

      it('should return a swagger with an http basePath if no scheme is defined (no array)', function() {
        delete api.schemes;
        return request
          .get('/swagger.json')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.id.should.equal('http://' + host + '/swagger.json#');
          });
      });

      it('should normalize oauth2 urls in security definitions', function() {
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
      const api = new API({ info: { version: '1.0.0' }});
      const app = express();
      const schema1 = { a: true, b: 2 };
      const schema2 = { c: 'd', e: [] };
      const spy1 = chai.spy(function(req, res) {
        res.send(schema1);
      });
      const spy2 = chai.spy(function(req, res) {
        res.send(schema2);
      });
      let server;

      before(function() {
        api.registerSchema('abc', spy1);
        api.registerSchema('def', spy2);
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

      it('should return the requested schema', function() {
        return request
          .get('/schemas/abc')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal(schema1);
            spy1.should.have.been.called.once();
            spy2.should.not.have.been.called();
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
    let server;

    before(function() {
      let r = express.Router();
      app.use(r);
      return api.attach(r).then(router => {
        app.use(router);
        server = app.listen(port);
      });
    });

    after(function() {
      server.close();
    });

    it('should attach the api on /v{major version} and refect that in the swagger', function() {
      return request
        .get('/v3/swagger.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          should.exist(data);
          data.swagger.should.equal('2.0');
          data.host.should.equal(host);
          data.basePath.should.equal('/v3');
          data.id.should.equal('https://' + host + '/v3/swagger.json#');
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

    const api = new API({ info: { version: '1.0.0' }});
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

});
