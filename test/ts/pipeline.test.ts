import { defineAbility } from '@casl/ability';
import * as chai from 'chai';
import * as spies from 'chai-spies';
import * as express from 'express';
import * as supertest from 'supertest';
import { API } from '../../dist/api';
import { Job, PipelineOperation, SimplePipelineOperation } from '../../dist/pipeline';
import { Resource } from '../../dist/resource';
import { APIRequest, APIResponse } from '../../dist/types';

chai.use(spies);

describe('pipeline', function () {
  describe('SimplePipelineOperation', function () {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const app = express();
    let server;

    class API1 extends API {
      initSecurity(req, res, next) {
        req.ability = defineAbility((can, cannot) => {
          can('manage', 'Test', ['a', 'b'], { c: 1 });
        });
        next();
      }
    }
    const api = new API1();
    let r = new Resource({ name: 'Test' });
    r.addOperation(
      new SimplePipelineOperation(
        (job) => {
          job.data = [
            { a: 'AAA', b: 'BBB', c: 1, d: true },
            { a: 'XXX', b: 'YYY', c: 1, d: false },
            { a: 'QQQ', b: 'RRR', c: 2, d: true },
            { a: 'MMM', b: 'NNN', c: 3, d: false },
          ];
          return Promise.resolve(job);
        },
        r,
        '/op1',
        'get',
        'op1'
      )
    );
    class Op2 extends PipelineOperation {
      async createJob(req: APIRequest, res: APIResponse): Promise<Job> {
        const job = await super.createJob(req, res);
        return {
          ...job,
          feat: {
            filter: {
              fields: false,
              data: false,
            },
          },
        };
      }
      async runOperation(job) {
        job.data = [
          { a: 'AAA', b: 'BBB', c: 1, d: true },
          { a: 'XXX', b: 'YYY', c: 1, d: false },
          { a: 'QQQ', b: 'RRR', c: 2, d: true },
          { a: 'MMM', b: 'NNN', c: 3, d: false },
        ];
        return Promise.resolve(job);
      }
    }
    r.addOperation(new Op2(r, '/op2', 'get', 'op2'));

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

    it('should return the data generated by runOperation, filtered by ability', function () {
      return request
        .get('/tests/op1')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal([
            { a: 'AAA', b: 'BBB' },
            { a: 'XXX', b: 'YYY' },
          ]);
        });
    });
    it('should return the data generated by runOperation, unfiltered by ability', function () {
      return request
        .get('/tests/op2')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal([
            { a: 'AAA', b: 'BBB', c: 1, d: true },
            { a: 'XXX', b: 'YYY', c: 1, d: false },
            { a: 'QQQ', b: 'RRR', c: 2, d: true },
            { a: 'MMM', b: 'NNN', c: 3, d: false },
          ]);
        });
    });
  });
  describe('csv format', function () {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const app = express();
    let server;
    let csv_data;
    let csv_options;

    const api = new API();
    let r = new Resource({ name: 'Test' });
    class Op extends PipelineOperation {
      async createJob(req: APIRequest, res: APIResponse): Promise<Job> {
        const job = await super.createJob(req, res);
        return {
          ...job,
          feat: {
            format: {
              type: 'csv',
              ...csv_options,
            },
          },
        };
      }
      async runOperation(job) {
        job.data = csv_data;
        return Promise.resolve(job);
      }
    }
    r.addOperation(new Op(r, '/', 'get', 'op'));

    api.addResource(r);

    before(function () {
      return api.router().then((router) => {
        app.use(router);
        server = app.listen(port);
      });
    });
    beforeEach(function (done) {
      csv_data = [];
      csv_options = { fields: [] };
      done();
    });
    after(function () {
      if (server) {
        server.close();
      }
    });

    it('should return the requested top level fields as csv', function () {
      csv_options = {
        fields: ['a', 'b'],
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1, d: true },
        { a: 'XXX', b: 'YYY', c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `AAA,BBB
XXX,YYY`
          );
        });
    });

    it('should return the requested top level fields as csv, with empty fields', function () {
      csv_options = {
        fields: ['a', 'e', 'b', 'c', 'd'],
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1, d: true },
        { a: 'XXX', b: 'YYY', c: 0, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `AAA,,BBB,1,true
XXX,,YYY,0,false`
          );
        });
    });

    it('should return the requested top level fields as csv, with quoted fields', function () {
      csv_options = {
        fields: ['a', 'b', 'c'],
        quotes: true,
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1, d: true },
        { a: 'XXX', b: 'YYY', c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `"AAA","BBB","1"
"XXX","YYY","1"`
          );
        });
    });

    it('should return the requested top level fields as csv, with quoted fields and escapes', function () {
      csv_options = {
        fields: ['a', 'b'],
        quotes: true,
      };
      csv_data = [
        { a: 'AAA', b: 'B"BB', c: 1, d: true },
        { a: 'XXX', b: 'Y"YY', c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `"AAA","B\\"BB"
"XXX","Y\\"YY"`
          );
        });
    });

    it('should return the requested top level fields as csv, with quoted fields and custom escapes', function () {
      csv_options = {
        fields: ['a', 'b'],
        quotes: true,
        escape: '*',
      };
      csv_data = [
        { a: 'AAA', b: 'B"BB', c: 1, d: true },
        { a: 'XXX', b: 'Y"YY', c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `"AAA","B*"BB"
"XXX","Y*"YY"`
          );
        });
    });

    it('should return the requested top level fields as csv, with custom separator and eol', function () {
      csv_options = {
        fields: ['a', 'b'],
        separator: ';',
        eol: '|',
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1, d: true },
        { a: 'XXX', b: 'YYY', c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`AAA;BBB|XXX;YYY`);
        });
    });

    it('should return the requested top level fields as csv, with custom decimal separator', function () {
      csv_options = {
        fields: ['a', 'b', 'c'],
        decimal: ',',
        quotes: true,
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1.5, d: true },
        { a: 'XXX', b: 'YYY', c: 1.9, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`"AAA","BBB","1,5"
"XXX","YYY","1,9"`);
        });
    });

    it('should return the requested top level fields as csv, with header', function () {
      csv_options = {
        fields: ['a', 'b'],
        header: true,
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1, d: true },
        { a: 'XXX', b: 'YYY', c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`a,b
AAA,BBB
XXX,YYY`);
        });
    });

    it('should return the requested top level fields as csv, with header and custom field names', function () {
      csv_options = {
        fields: { a: 'x', b: 'y' },
        header: true,
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1, d: true },
        { a: 'XXX', b: 'YYY', c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`x,y
AAA,BBB
XXX,YYY`);
        });
    });

    it('should return the requested top level fields as csv, as attachment', function () {
      csv_options = {
        fields: { a: 'x', b: 'y' },
        filename: 'test.csv',
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: 1, d: true },
        { a: 'XXX', b: 'YYY', c: 1, d: false },
      ];
      return request.get('/tests').expect(200).expect('Content-Disposition', `attachment; filename="test.csv"`);
    });

    it('should unwind the original objects and return the requested fields', function () {
      csv_options = {
        fields: ['a', 'b', 'c'],
        header: true,
        unwind: 'c',
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: ['mmm', 'nnn', 'ooo'] },
        { a: 'XXX', b: 'YYY', c: ['ppp', 'qqq'] },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`a,b,c
AAA,BBB,mmm
AAA,BBB,nnn
AAA,BBB,ooo
XXX,YYY,ppp
XXX,YYY,qqq`);
        });
    });

    it('should ship an object if the unwind field is not an array with at least an element (1)', function () {
      csv_options = {
        fields: ['a', 'b', 'c'],
        header: true,
        unwind: 'c',
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: true },
        { a: 'XXX', b: 'YYY', c: ['ppp', 'qqq'] },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`a,b,c
XXX,YYY,ppp
XXX,YYY,qqq`);
        });
    });

    it('should ship an object if the unwind field is not an array with at least an element (2)', function () {
      csv_options = {
        fields: ['a', 'b', 'c'],
        header: true,
        unwind: 'c',
      };
      csv_data = [
        { a: 'AAA', b: 'BBB', c: [] },
        { a: 'XXX', b: 'YYY', c: ['ppp', 'qqq'] },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`a,b,c
XXX,YYY,ppp
XXX,YYY,qqq`);
        });
    });

    it('should ship an object if the unwind field is not an array with at least an element (3)', function () {
      csv_options = {
        fields: ['a', 'b', 'c'],
        header: true,
        unwind: 'c',
      };
      csv_data = [
        { a: 'AAA', b: 'BBB' },
        { a: 'XXX', b: 'YYY', c: ['ppp', 'qqq'] },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(`a,b,c
XXX,YYY,ppp
XXX,YYY,qqq`);
        });
    });

    it('should format dates as ISO', function () {
      csv_options = {
        fields: ['a', 'b'],
      };
      csv_data = [
        { a: 'AAA', b: new Date('2022-01-28'), c: 1, d: true },
        { a: 'XXX', b: new Date(Date.UTC(2022, 0, 28, 11, 38, 45)), c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `AAA,2022-01-28T00:00:00.000Z
XXX,2022-01-28T11:38:45.000Z`
          );
        });
    });

    it('should format dates with specific date format', function () {
      csv_options = {
        fields: ['a', 'b'],
        dateFormat: 'dd/LL/yyyy',
      };
      csv_data = [
        { a: 'AAA', b: new Date('2022-01-28'), c: 1, d: true },
        { a: 'XXX', b: new Date(Date.UTC(2022, 0, 28, 11, 38, 45)), c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `AAA,28/01/2022
XXX,28/01/2022`
          );
        });
    });

    it('should format dates with specific date and time format', function () {
      csv_options = {
        fields: ['a', 'b'],
        dateFormat: 'dd/LL/yyyy hh.mm.ss',
        timezone: 'Europe/Rome',
      };
      csv_data = [
        { a: 'AAA', b: new Date('2022-01-28'), c: 1, d: true },
        { a: 'XXX', b: new Date(Date.UTC(2022, 0, 28, 11, 38, 45)), c: 1, d: false },
      ];
      return request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .then(({ text: data }) => {
          data.should.equal(
            `AAA,28/01/2022 01.00.00
XXX,28/01/2022 12.38.45`
          );
        });
    });
  });
});
