import chai from 'chai';
import spies from 'chai-spies';
import express from 'express';
import supertest from 'supertest';
import { API } from '../../dist/api.js';
import { Resource } from '../../dist/resource.js';
import { JSONRPC, rpc } from '../../dist/rpc.js';

const should = chai.should();
chai.use(spies);

describe('JSONRPC Operation', function () {
  const port = 9876;
  const host = 'localhost:' + port;
  const basePath = 'http://' + host;
  const request = supertest(basePath);
  const app = express();
  let server;

  const api = new API();

  class TestRPC extends JSONRPC {
    @rpc
    async sum({ x = 0, y = 0 } = {}): Promise<number> {
      return x + y;
    }
    @rpc
    async pow({ x = 0, y = 0 } = {}): Promise<number> {
      return Math.pow(x, y);
    }
    @rpc
    fail(): never {
      throw 'errore';
    }
  }

  let r = new Resource({ name: 'Test' }, { '/': { post: TestRPC as any } });
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

  it('should call an existing method', function () {
    return request
      .post('/tests/')
      .send({ jsonrpc: '2.0', method: 'sum', params: { x: 3, y: 4 }, id: 100 })
      .expect(200)
      .expect('Content-Type', /json/)
      .then(({ body: data }) => {
        data.jsonrpc.should.equal('2.0');
        data.result.should.equal(7);
        data.id.should.equal(100);
      });
  });
  it('should fail when calling an unknown method', function () {
    return request
      .post('/tests/')
      .send({ jsonrpc: '2.0', method: 'aaa', params: { x: 3, y: 4 }, id: 100 })
      .expect(200)
      .expect('Content-Type', /json/)
      .then(({ body: data }) => {
        data.jsonrpc.should.equal('2.0');
        data.error.code.should.equal(-32601);
        data.id.should.equal(100);
      });
  });
  it('should fail when calling a mathod not tagged as RPC', function () {
    return request
      .post('/tests/')
      .send({ jsonrpc: '2.0', method: 'getCustomInfo', id: 100 })
      .expect(200)
      .expect('Content-Type', /json/)
      .then(({ body: data }) => {
        data.jsonrpc.should.equal('2.0');
        data.error.code.should.equal(-32601);
        data.id.should.equal(100);
      });
  });
  it('should fail with a generic error if a generic exception is thrown', function () {
    return request
      .post('/tests/')
      .send({ jsonrpc: '2.0', method: 'fail', id: 100 })
      .expect(200)
      .expect('Content-Type', /json/)
      .then(({ body: data }) => {
        data.jsonrpc.should.equal('2.0');
        data.error.code.should.equal(-32000);
        data.id.should.equal(100);
      });
  });
  it('should not return a body if a request, without id, succeeds', function () {
    return request.post('/tests/').send({ jsonrpc: '2.0', method: 'sum' }).expect(200).expect('Content-Length', '0');
  });
  it('should return an error with null id, if a request, without id, failed (bad method)', function () {
    return request
      .post('/tests/')
      .send({ jsonrpc: '2.0', method: 'aaa' })
      .expect(200)
      .expect('Content-Type', /json/)
      .then(({ body: data }) => {
        data.jsonrpc.should.equal('2.0');
        data.error.code.should.equal(-32601);
        should.not.exist(data.id);
      });
  });
  it('should return an error with null id, if a request, without id, failed (generic error)', function () {
    return request
      .post('/tests/')
      .send({ jsonrpc: '2.0', method: 'fail' })
      .expect(200)
      .expect('Content-Type', /json/)
      .then(({ body: data }) => {
        data.jsonrpc.should.equal('2.0');
        data.error.code.should.equal(-32000);
        should.not.exist(data.id);
      });
  });
});
