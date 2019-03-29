let chai = require('chai')
  , spies = require('chai-spies')
  , chaiAsPromised = require('chai-as-promised')
  , should = chai.should()
  , express = require('express')
  , SchemaRegistry = require('../../dist/schema').SchemaRegistry

chai.use(spies);
chai.use(chaiAsPromised);

describe('SchemaRegistry', function() {

  describe('constructor', function() {

    it('should create a registry with the given scope', function() {
      let scope = 'http://example.com/a/b';
      let registry = new SchemaRegistry(scope);
      registry.opts.scope.should.equal(scope);
    });

    it('should create a registry with an undefined scope', function() {
      let registry = new SchemaRegistry();
      should.not.exist(registry.opts.scope);
    });

  });

  describe('resolve', function() {

    it('should resolve an object with local references', function() {
      let registry = new SchemaRegistry('http://example.com/a/b');
      return registry.resolve({
        a: true,
        b: { $ref: "#/a" }
      }).then(function(data) {
        data.a.should.equal(data.b);
      });
    });

    it('should fail when resolving a non existent url', function() {
      this.slow(1000);
      let registry = new SchemaRegistry('http://example.com/a/b');
      return registry.resolve('http://undefined.example.com').then(function(data) {
        should.fail();
      }, function(err) {
        err.should.be.instanceOf(Error);
        return err;
      });
    });

    it('should fail when resolving a non existent url', function() {
      this.slow(1000);
      let registry = new SchemaRegistry('http://example.com/a/b');
      return registry.resolve('http://example.com/undefined').then(function(data) {
        should.fail();
      }, function(err) {
        err.should.be.instanceOf(Error);
        err.code.should.equal(404);
        return err;
      });
    });

    it('should resolve an object with remote references', function() {
      let app = express();
      let spy = chai.spy(function(req, res) {
        res.send({ x: 1, y: 10 });
      });
      app.get('/a/b/c', spy);
      let server = app.listen(9876);

      let registry = new SchemaRegistry('http://localhost:9876/a/b/');
      return registry.resolve({
        a: true,
        b: { $ref: 'c#/y' }
      }).then(function(data) {
        server.close();
        spy.should.have.been.called.once();
        data.b.should.equal(10);
      }, function(err) {
        server.close();
        throw err;
      });
    });

  });

  describe('create', function() {

    it('should create a schema from an object', function() {
      let registry = new SchemaRegistry('http://localhost:9876/a/b/');
      return registry.create({
        type: 'object',
        properties: {
          a: {
            type: 'boolean'
          }
        },
        additionalProperties: false,
        required: [ 'a' ]
      }).then(function(schema) {
        return Promise.all([
          schema.validate({ a: true }).should.be.fulfilled,
          schema.validate({ a: 1 }).should.be.rejected,
          schema.validate({ a: true, b: 1 }).should.be.rejected
        ]);
      });
    });

    it('should create a schema from an url', function() {
      let app = express();
      let spy = chai.spy(function(req, res) {
        res.send({
          type: 'object',
          properties: {
            a: {
              type: 'boolean'
            }
          },
          additionalProperties: false,
          required: [ 'a' ]
        });
      });
      app.get('/a/b/c', spy);
      let server = app.listen(9876);

      let registry = new SchemaRegistry('http://localhost:9876/a/b/');
      return registry.create('c').then(function(schema) {
        server.close();
        spy.should.have.been.called.once();
        return Promise.all([
          schema.validate({ a: true }).should.be.fulfilled,
          schema.validate({ a: 1 }).should.be.rejected,
          schema.validate({ a: true, b: 1 }).should.be.rejected
        ]);
      }, function(err) {
        server.close();
        throw err;
      });
    });

  });

});
