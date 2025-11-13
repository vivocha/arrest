import { Ability, defineAbility } from '@casl/ability';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import express from 'express';
import _ from 'lodash';
import { CollectionOptions, MongoClient, ReadPreference } from 'mongodb';
import { DokiConfiguration, Mongodoki } from 'mongodoki';
import { OpenAPIV3 } from 'openapi-police';
import supertest from 'supertest';
import { API } from '../../dist/api.js';
import { CreateMongoOperation, MongoJob, MongoOperation, MongoResource, PatchMongoOperation, QueryMongoOperation } from '../../dist/mongo/index.js';
import { APIRequest, APIResponse, Method } from '../../dist/types.js';

const should = chai.should();
chai.use(chaiAsPromised);

describe('mongo', function () {
  const md = new Mongodoki({ reuse: true } as DokiConfiguration);

  before(async function () {
    this.timeout(0);
    await md.getDB('local');
  });

  describe('MongoResource', function () {
    describe('constructor', function () {
      const collectionName = 'arrest_test';
      let db;

      afterEach(async function () {
        let _db;
        if (db) {
          try {
            _db = await db;
            await _db.dropCollection(collectionName);
          } catch (err) {
          } finally {
            //await _db.close();
            db = undefined;
          }
        }
      });

      it('should connect to a mongodb via a connection uri', function () {
        const r = new MongoResource('mongodb://localhost:27017/local', { name: 'Test' });
        const info = r.info as any;
        info.collection.should.equal('tests');
        info.id.should.equal('_id');
        info.idIsObjectId.should.equal(true);
        db = r.db;
        return r.db;
      });

      it('should fail to connect to a wrong connection uri', function () {
        const r = new MongoResource('mongodb://localhost:97017/local?serverSelectionTimeoutMS=1000', { name: 'Test' });
        return r.db.should.be.rejected;
      });

      it('should use an existing valid db connection', async function () {
        const c = MongoClient.connect('mongodb://localhost:27017/local').then((c) => c.db());
        let r = new MongoResource(c, { name: 'Test' });
        db = r.db;
        return r.db;
      });

      it('should fail with an existing failed db connection', function () {
        const c = MongoClient.connect('mongodb://localhost:97017/local?serverSelectionTimeoutMS=1000').then((c) => c.db());
        const r = new MongoResource(c, { name: 'Test' });
        return r.db.should.be.rejected;
      });

      it('should use the specified collection and id parameters', function () {
        const r = new MongoResource('mongodb://localhost:27017/local', { name: 'Test', collection: 'a', id: 'b', idIsObjectId: false });
        const info = r.info as any;
        info.collection.should.equal('a');
        info.id.should.equal('b');
        info.idIsObjectId.should.equal(false);
        db = r.db;
        return r.db;
      });

      it('should not fail if a required index is missing and createIndexes is false', async function () {
        const r = new MongoResource('mongodb://localhost:27017/local', {
          name: 'Test',
          collection: collectionName,
          id: 'b',
          idIsObjectId: false,
        });

        db = r.db;
        return r.getCollection();
      });

      it('should create the required indexes', async function () {
        const r = new MongoResource('mongodb://localhost:27017/local', {
          name: 'Test',
          collection: collectionName,
          id: 'b',
          idIsObjectId: false,
          createIndexes: true,
        });

        db = r.db;
        let coll = await r.getCollection();
        let indexes = await coll.indexes();
        return indexes.length.should.equal(2);
      });

      it('should detect existing indexes matching the required ones', async function () {
        const r = new MongoResource('mongodb://localhost:27017/local', {
          name: 'Test',
          collection: collectionName,
          id: 'b',
          idIsObjectId: false,
          createIndexes: true,
        });
        (r as any).getIndexes = () => [
          {
            key: { b: 1 },
            unique: true,
            name: 'a_1',
          },
        ];
        db = r.db;
        let coll = (await db).collection((r.info as any).collection);
        await coll.createIndex({ b: 1 }, { unique: true });

        coll = await r.getCollection();
        const indexes = await coll.indexes();
        return indexes.length.should.equal(2);
      });

      it('should fail if an existing index has different options', async function () {
        const r = new MongoResource('mongodb://localhost:27017/local', {
          name: 'Test',
          collection: collectionName,
          id: 'b',
          idIsObjectId: false,
          createIndexes: true,
        });

        db = r.db;
        const coll = (await db).collection((r.info as any).collection);
        await coll.createIndex({ b: 1 }, {});
        await r.getCollection().should.be.rejected;
      });
    });
  });

  describe('MongoOperation', async function () {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const app = express();
    const api = new API();
    const collectionName = 'arrest_test';

    class FakeOp1 extends QueryMongoOperation {
      getDefaultInfo() {
        let out = super.getDefaultInfo();
        delete out.parameters;
        return out;
      }
    }

    class FakeOp2 extends QueryMongoOperation {
      prepareOpts(job) {
        job.opts.readPreference = ReadPreference.SECONDARY_PREFERRED;
        return job;
      }
    }

    class Aggregation extends QueryMongoOperation {
      async prepareOpts(job) {
        job = await super.prepareOpts(job);
        if (!job.req.query.fields) {
          delete job.opts.projection;
        }
        return job;
      }
      async prepareQuery(job) {
        job = await super.prepareQuery(job);
        job.query = [{ $match: job.query }];
        return job;
      }
    }

    class AggregationFromSecondary extends Aggregation {
      async prepareOpts(job) {
        job = await super.prepareOpts(job);
        job.opts.readPreference = ReadPreference.SECONDARY_PREFERRED;
        return job;
      }
    }

    class DateOp extends CreateMongoOperation {
      get requestSchema(): OpenAPIV3.SchemaObject {
        return {
          type: 'object',
          properties: {
            ts: {
              type: 'string',
              format: 'date-time',
            },
          },
        };
      }
    }

    let db, id, coll, coll2, r1, r2, r3, r4, r5, r6, r7, r8, server;

    before(async function () {
      db = await MongoClient.connect('mongodb://localhost:27017/local').then((c) => c.db());
      r1 = new MongoResource(db, { name: 'Test', collection: collectionName });
      r2 = new MongoResource(db, { name: 'Other', collection: collectionName, id: 'myid', idIsObjectId: false, queryLimit: 5 });
      r3 = new MongoResource(db, { name: 'Fake', collection: collectionName }, { '/1': { get: FakeOp1 }, '/2': { get: FakeOp2 } });
      r4 = new MongoResource(db, { name: 'Oid', collection: collectionName + '_oid', id: 'myoid', idIsObjectId: true });
      r5 = new MongoResource(db, { name: 'Aggregation', collection: collectionName }, { '/': { get: Aggregation } });
      r6 = new MongoResource(db, { name: 'Escape', collection: collectionName, id: 'myid', escapeProperties: true });
      r7 = new MongoResource(db, { name: 'SecondaryAggregation', collection: collectionName }, { '/': { get: AggregationFromSecondary } });
      r8 = new MongoResource(db, { name: 'Date', collection: collectionName }, { '/': { post: DateOp } });
      api.addResource(r1);
      api.addResource(r2);
      api.addResource(r3);
      api.addResource(r4);
      api.addResource(r5);
      api.addResource(r6);
      api.addResource(r7);
      api.addResource(r8);

      let router = await api.router();
      app.use(router);
      server = app.listen(port);
      coll = db.collection(collectionName);
      coll2 = db.collection(collectionName + '_oid');
      return coll.createIndex({ myid: 1 }, { unique: true });
    });

    after(async function () {
      server.close();
      try {
        await db.dropCollection(collectionName);
        await db.dropCollection(collectionName + '_oid');
      } catch (e) {
      } finally {
        //await db.close();
      }
    });

    it('should install default operation handlers', function () {
      const doc = api.document as any;
      doc.paths['/tests'].get.operationId.should.equal('Test.query');
      doc.paths['/tests'].post.operationId.should.equal('Test.create');
      doc.paths['/tests/{id}'].get.operationId.should.equal('Test.read');
      doc.paths['/tests/{id}'].put.operationId.should.equal('Test.update');
      doc.paths['/tests/{id}'].delete.operationId.should.equal('Test.remove');
    });

    describe('create', function () {
      it('should create a new record with server generated _id', function () {
        return request
          .post('/tests')
          .send({ a: 1, b: true })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            let m = res.headers.location.match(/http:\/\/localhost:9876\/tests\/([a-f0-9]{24})/);
            m[1].length.should.equal(24);
            id = m[1];
          })
          .then(({ body: data }) => {
            return coll.findOne().then((found) => {
              data.should.deep.equal(JSON.parse(JSON.stringify(found)));
              data.should.deep.equal({ a: 1, b: true, _id: id });
            });
          });
      });

      it('should create a new record with server generated custom id', function () {
        let oid;
        return request
          .post('/oids')
          .send({ c: 3, d: false })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            let m = res.headers.location.match(/http:\/\/localhost:9876\/oids\/([a-f0-9]{24})/);
            m[1].length.should.equal(24);
            oid = m[1];
          })
          .then(({ body: data }) => {
            return coll2.findOne({}, { projection: { _id: 0 } }).then((found) => {
              data.should.deep.equal(JSON.parse(JSON.stringify(found)));
              data.should.deep.equal({ c: 3, d: false, myoid: oid });
            });
          });
      });

      it('should create a new record with client generated id', function () {
        return request
          .post('/others')
          .send({ myid: 'aaa', a: 1, b: true })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            res.headers.location.should.equal('http://localhost:9876/others/aaa');
          })
          .then(({ body: data }) => {
            return coll.findOne({ myid: 'aaa' }).then((found) => {
              delete found._id;
              data.should.deep.equal(JSON.parse(JSON.stringify(found)));
            });
          });
      });

      it('should fail to create a new record with duplicated id', function () {
        return request
          .post('/others')
          .send({ myid: 'aaa', a: 1, b: true })
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('duplicate key');
          });
      });

      it('should fail to create a new record with an invalid attribute', function () {
        return request
          .post('/others')
          .send({ myid: 'bbb', _id: { $a: 1 } })
          .expect(500)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('internal');
          });
      });

      it('should create a new record with an invalid attribute, escaping it', function () {
        return request
          .post('/escapes')
          .send({ myid: 'bbb', 'a.b.c.d': 1 })
          .expect(201)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ myid: 'bbb', 'a.b.c.d': 1 });
          });
      });

      it('should create a record with a date preserving its type', function () {
        return request
          .post('/dates')
          .send({ myid: 'ts', ts: new Date() })
          .expect(201)
          .expect('Content-Type', /json/)
          .then(async ({ body: data }) => {
            const ref = await coll.findOne({}, { sort: { _id: -1 } });
            await coll.deleteMany({ myid: 'ts' });
            ref.ts.should.be.a('Date');
          });
      });
    });

    describe('collection', function () {
      it('should fail to return a non existent collection in strict mode', function () {
        class TestOperation extends MongoOperation {
          getCollectionOptions(): CollectionOptions {
            return { strict: true } as CollectionOptions;
          }
          runOperation(job: MongoJob): Promise<MongoJob> {
            return Promise.resolve(job);
          }
        }

        let r = new MongoResource(db, { name: 'Test', collection: 'aaa' });
        let c = new TestOperation(r, '/', 'get', 'x');
        c.collection.then(
          () => {
            throw new Error('should not get here');
          },
          (err) => true
        );
      });
    });

    describe('read', function () {
      it('should return a record by object id', function () {
        return request
          .get('/tests/' + id)
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1, b: true, _id: id });
          });
      });

      it('should return the selected fields of a record by object id', function () {
        return request
          .get(`/tests/${id}?fields=_metadata,a`)
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1 });
          });
      });

      it('should return selected fields using RQL select() for a single record', function () {
        return request
          .get(`/tests/${id}?q=select(a,b)`)
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1, b: true, _id: id });
          });
      });

      it('should fail with a malformed object id', function () {
        return request
          .get('/tests/x')
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should fail with an unknown object id', function () {
        return request
          .get('/tests/000000000000000000000000')
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should return a record by custom id', function () {
        return request
          .get('/others/aaa')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1, b: true, myid: 'aaa' });
          });
      });

      it('should return the selected fields of a record by custom id', function () {
        return request
          .get('/others/aaa?fields=_id,_metadata,a')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1 });
          });
      });

      it('should fail with an unknown custom id', function () {
        return request
          .get('/tests/000')
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });
    });

    describe('update', function () {
      it('should update a record by object id', function () {
        return request
          .put('/tests/' + id)
          .send({ a: 2 })
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 2, b: true, _id: id });
          });
      });

      it('should fail with a malformed object id', function () {
        return request
          .put('/tests/x')
          .send({ a: 3 })
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should fail with an unknown object id', function () {
        return request
          .put('/tests/000000000000000000000000')
          .send({ a: 3 })
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should update a record by custom id', function () {
        return request
          .put('/others/aaa')
          .send({ a: 3 })
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 3, b: true, myid: 'aaa' });
          });
      });

      it('should fail with an unknown custom id', function () {
        return request
          .put('/tests/000')
          .send({ a: 4 })
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });
      it('should add an invalid property name, if escaped', function () {
        return request
          .put('/escapes/bbb')
          .send({ $x: 4 })
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ myid: 'bbb', 'a.b.c.d': 1, $x: 4 });
          });
      });
    });

    describe('patch', function () {
      it('should patch a record by object id', function () {
        return request
          .patch('/tests/' + id)
          .send([
            { op: 'add', path: '/e', value: [{ a: 1 }] },
            { op: 'add', path: '/f', value: [1, 2, 3] },
          ])
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 2, b: true, e: [{ a: 1 }], f: [1, 2, 3], _id: id });
          });
      });

      it('should perform several changes to a record by object id', function () {
        return request
          .patch('/tests/' + id)
          .send([
            { op: 'test', path: '/b', value: true },
            { op: 'replace', path: '/a', value: 4 },
            { op: 'add', path: '/c', value: { d: true } },
            { op: 'remove', path: '/b' },
            { op: 'replace', path: '/e/0/a', value: 2 },
            { op: 'add', path: '/f/-', value: 4 },
          ])
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 4, c: { d: true }, e: [{ a: 2 }], f: [1, 2, 3, 4], _id: id });
          });
      });

      it('should fail with a malformed object id', function () {
        return request
          .patch('/tests/x')
          .send([{ op: 'replace', path: '/a', value: 3 }])
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should fail with an unknown object id', function () {
        return request
          .patch('/tests/000000000000000000000000')
          .send([{ op: 'replace', path: '/a', value: 3 }])
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should patch a record by custom id', function () {
        return request
          .patch('/others/aaa')
          .send([{ op: 'replace', path: '/a', value: 4 }])
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 4, b: true, myid: 'aaa' });
          });
      });

      it('should fail with an unknown custom id', function () {
        return request
          .patch('/tests/000')
          .send([{ op: 'replace', path: '/a', value: 3 }])
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should patch a record with invalid properties, if escaped', function () {
        return request
          .patch('/escapes/bbb')
          .send([
            { op: 'add', path: '/$z', value: false },
            { op: 'replace', path: '/a.b.c.d', value: 10 },
            { op: 'remove', path: '/$x' },
          ])
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ myid: 'bbb', 'a.b.c.d': 10, $z: false });
          });
      });
    });

    describe('query', function () {
      before(function () {
        return Promise.all([
          request.post('/tests').send({ myid: 'test2', y: 11, z: false, p: 'bbb' }).expect(201),
          request.post('/tests').send({ myid: 'test3', y: 30, z: false }).expect(201),
          request.post('/tests').send({ myid: 'test1', y: 13, z: true, p: 'aaa' }).expect(201),
          request.post('/tests').send({ myid: 'test4', y: 20, p: 'ddd' }).expect(201),
        ]);
      });

      it('should return all objects in the collection (1)', function () {
        return request
          .get('/tests')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(7);
          });
      });

      it('should return selected objects in the collection as CSV', function () {
        return request
          .get('/tests?q=gt(y,0)&sort=y&format=csv&csv_fields=myid,y,z')
          .expect(200)
          .expect('Content-Type', /text\/csv/)
          .expect('Results-Matching', '4')
          .then(({ text: data }) => {
            data.should.equal('test2,11,false\ntest1,13,true\ntest4,20,\ntest3,30,false');
          });
      });

      it('should return selected objects in the collection as CSV with a header', function () {
        return request
          .get('/tests?q=gt(y,0)&sort=y&format=csv&csv_fields=myid,y,z&csv_options=header=true')
          .expect(200)
          .expect('Content-Type', /text\/csv/)
          .expect('Results-Matching', '4')
          .then(({ text: data }) => {
            data.should.equal('myid,y,z\ntest2,11,false\ntest1,13,true\ntest4,20,\ntest3,30,false');
          });
      });

      it('should return selected objects in the collection as CSV with names remapped', function () {
        return request
          .get('/tests?q=gt(y,0)&sort=y&format=csv&csv_fields=myid,y,z&csv_names=a,b,c&csv_options=header=true')
          .expect(200)
          .expect('Content-Type', /text\/csv/)
          .expect('Results-Matching', '4')
          .then(({ text: data }) => {
            data.should.equal('a,b,c\ntest2,11,false\ntest1,13,true\ntest4,20,\ntest3,30,false');
          });
      });

      it('should return all objects in the collection (2)', function () {
        return request
          .get('/fakes/1')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(7);
          });
      });

      it('should return all objects in the collection (3)', function () {
        return request
          .get('/fakes/2')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(7);
          });
      });

      it('should return all objects in the collection (4)', function () {
        return request
          .get('/aggregations')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(7);
          });
      });

      it('should return all objects in the collection (5)', function () {
        return request
          .get('/secondary-aggregations')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(7);
          });
      });

      it('should return all objects in the collection (6), up to hardcoded limit', function () {
        return request
          .get('/others')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(5);
          });
      });

      it('should return all objects in the collection (7), up to the lower of requested and hardcoded limits', function () {
        return request
          .get('/others?limit=6')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(5);
          });
      });

      it('should return all objects in the collection (8), up to the lower of requested and hardcoded limits', function () {
        return request
          .get('/others?limit=4')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(4);
          });
      });

      it('should return a single attribute of all objects, in ascending order by id (1)', function () {
        return request
          .get('/tests?fields=y&sort=myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 13 });
            data[1].should.deep.equal({ y: 11 });
            data[2].should.deep.equal({ y: 30 });
            data[3].should.deep.equal({ y: 20 });
          });
      });

      it('should return selected fields using RQL select() operator', function () {
        return request
          .get('/tests?q=select(y,myid)&sort=myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(6); // 6 records have myid or y (1 record has only _id)
            data[0].should.deep.equal({ myid: 'aaa' });
            data[1].should.deep.equal({ myid: 'bbb' });
            data[2].should.deep.equal({ myid: 'test1', y: 13 });
            data[3].should.deep.equal({ myid: 'test2', y: 11 });
            data[4].should.deep.equal({ myid: 'test3', y: 30 });
            data[5].should.deep.equal({ myid: 'test4', y: 20 });
          });
      });

      it('should return a single attribute of all objects, in ascending order by id (2)', function () {
        return request
          .get('/tests?fields=y&sort=%2Bmyid') // +myid
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 13 });
            data[1].should.deep.equal({ y: 11 });
            data[2].should.deep.equal({ y: 30 });
            data[3].should.deep.equal({ y: 20 });
          });
      });

      it('should return a single attribute of all objects, in ascending order by id (3)', function () {
        return request
          .get('/aggregations?fields=y&sort=%2Bmyid') // +myid
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 13 });
            data[1].should.deep.equal({ y: 11 });
            data[2].should.deep.equal({ y: 30 });
            data[3].should.deep.equal({ y: 20 });
          });
      });

      it('should return a single attribute of all objects, in descending order by id (1)', function () {
        return request
          .get('/tests?fields=y,&sort=-myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 20 });
            data[1].should.deep.equal({ y: 30 });
            data[2].should.deep.equal({ y: 11 });
            data[3].should.deep.equal({ y: 13 });
          });
      });

      it('should return a single attribute of all objects, in descending order by id (2)', function () {
        return request
          .get('/others?fields=y,_id&sort=-myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 20 });
            data[1].should.deep.equal({ y: 30 });
            data[2].should.deep.equal({ y: 11 });
            data[3].should.deep.equal({ y: 13 });
          });
      });

      it('should return a single attribute of all objects, in descending order by id (3)', function () {
        return request
          .get('/aggregations?fields=y,&sort=-myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 20 });
            data[1].should.deep.equal({ y: 30 });
            data[2].should.deep.equal({ y: 11 });
            data[3].should.deep.equal({ y: 13 });
          });
      });

      it('should return the _id and a specified attribute (if available) of all objects', function () {
        return request
          .get('/tests?fields=y,_id')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .then(({ body: data }) => {
            data.length.should.equal(7);
            data[0]._id.should.be.a('string');
            data[1]._id.should.be.a('string');
            data[2]._id.should.be.a('string');
            data[3]._id.should.be.a('string');
          });
      });

      it('should skip and limit the results (1)', function () {
        return request
          .get('/tests?limit=2&skip=3')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .expect('Results-Skipped', '3')
          .then(({ body: data }) => {
            data.length.should.equal(2);
          });
      });

      it('should skip and limit the results (2)', function () {
        return request
          .get('/aggregations?limit=2&skip=3')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '7')
          .expect('Results-Skipped', '3')
          .then(({ body: data }) => {
            data.length.should.equal(2);
          });
      });

      it('should return an empty array is no match is found', function () {
        return request
          .get('/aggregations?q=eq(z,100)')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '0')
          .then(({ body: data }) => {
            data.should.deep.equal([]);
          });
      });

      it('should return zero results with an invalid query', function () {
        return request.get('/tests?q=eq($__$,0)').expect(200).expect('Content-Type', /json/).expect('Results-Matching', '0');
      });

      it('should support rql queries on non-ObjectId ids', async function () {
        const ref = await coll.findOne({ myid: { $exists: true } });
        return request
          .get(`/others?q=eq(myid,${ref.myid})`)
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '1')
          .then(({ body: data }) => {
            data[0].should.deep.equal(_.omit(ref, '_id'));
          });
      });

      it('should support rql queries on ObjectId ids', async function () {
        const ref = await coll.findOne({});
        return request
          .get(`/tests?q=eq(_id,${ref._id.toString()})`)
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '1')
          .then(({ body: data }) => {
            data[0].should.deep.equal(JSON.parse(JSON.stringify(ref)));
          });
      });
    });

    describe('remove', function () {
      it('should remove a resource by object', function () {
        return request
          .delete('/tests/' + id)
          .expect(200)
          .then(({ body: data }) => {
            data.should.deep.equal({});
          });
      });

      it('should fail to removed an unknown resource', function () {
        return request
          .delete('/tests/' + id)
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });
    });
  });

  describe('MongoOperation with Ability', async function () {
    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const app = express();
    const collectionName = 'arrest_test';

    class TestAPI extends API {
      initSecurity(req: APIRequest, res: APIResponse, next: express.NextFunction) {
        req.ability = defineAbility((can, cannot) => {
          can('create', 'Test', ['id', 'a', 'b', 'c.**', 'd.x']);
          can(['read', 'query'], 'Test', ['id', 'a', 'b', 'c.f'], { a: { $lte: 3 } });
          cannot(['read', 'query'], 'Test', { z: { $gt: 1 } });
          can('update', 'Test', ['b']);
          can('patch', 'Test', ['b', 'c.d']);
          can('op2', 'Test');
        }) as Ability;
        next();
      }
    }
    const api = new TestAPI();

    class TestOp1 extends QueryMongoOperation {
      constructor(resource: MongoResource, path: string, method: Method) {
        super(resource, path, method, 'op1');
      }
      get swaggerScopes() {
        return {};
      }
    }

    class TestOp2 extends PatchMongoOperation {
      constructor(resource: MongoResource, path: string, method: Method) {
        super(resource, path, method, 'op2');
      }
    }

    class TestOp3 extends PatchMongoOperation {
      constructor(resource: MongoResource, path: string, method: Method) {
        super(resource, path, method, 'op3');
      }
      get swaggerScopes() {
        return {};
      }
    }

    let db, r1, server;

    before(async function () {
      db = await MongoClient.connect('mongodb://localhost:27017/local').then((c) => c.db());
      r1 = new MongoResource(
        db,
        { name: 'Test', collection: collectionName, id: 'id', idIsObjectId: false },
        Object.assign({ '/op1': { get: TestOp1 }, '/op2/:id': { patch: TestOp2 }, '/op3/:id': { patch: TestOp3 } }, MongoResource.defaultRoutes())
      );
      api.addResource(r1);

      let router = await api.router();
      app.use(router);
      server = app.listen(port);
    });

    after(async function () {
      server.close();
      try {
        await db.dropCollection(collectionName);
      } catch (e) {
      } finally {
        //await db.close();
      }
    });

    it('should create a record compliant with the ability', async function () {
      await request
        .post('/tests')
        .send({ id: 'a', a: 1, b: 2, c: { d: 1 } })
        .expect(201);
      await request
        .post('/tests')
        .send({ id: 'b', a: 3, b: 2, c: [{ d: 1 }, { e: 1 }, { d: 2, e: 2 }, { d: 3, f: 3 }] })
        .expect(201);
      await request
        .post('/tests')
        .send({ id: 'c', a: 5, b: 2, c: { d: 1 }, d: { x: true } })
        .expect(201);
      await request.post('/tests').send({ id: 'd', d: 1 }).expect(403);
      await request
        .post('/tests')
        .send({ id: 'd', d: [{ z: false }] })
        .expect(403);
    });
    it('should query records according with the ability', async function () {
      await request
        .get('/tests')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect('Results-Matching', '2')
        .then(({ body: data }) => {
          data.length.should.equal(2);
          data[0].should.deep.equal({ id: 'a', a: 1, b: 2 });
          data[1].should.deep.equal({ id: 'b', a: 3, b: 2, c: [{ f: 3 }] });
        });
      await request
        .get('/tests/a')
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal({ id: 'a', a: 1, b: 2 });
        });
    });
    it('should query records ignoring the ability if no scopes are defined', async function () {
      await request
        .get('/tests/op1?fields=id,a,b,c.d')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect('Results-Matching', '3')
        .then(({ body: data }) => {
          data.length.should.equal(3);
          data[0].should.deep.equal({ id: 'a', a: 1, b: 2, c: { d: 1 } });
          data[1].should.deep.equal({ id: 'b', a: 3, b: 2, c: [{ d: 1 }, {}, { d: 2 }, { d: 3 }] });
          data[2].should.deep.equal({ id: 'c', a: 5, b: 2, c: { d: 1 } });
        });
    });
    it('should update records according with the ability', async function () {
      await request
        .put('/tests/a')
        .send({ b: 3 })
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal({ b: 3 });
        });
      await request.put('/tests/a').send({ a: 6 }).expect(403);
    });
    it('should patch records according with the ability', async function () {
      await request
        .patch('/tests/b')
        .send([{ op: 'replace', path: '/b', value: 5 }])
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal({ b: 5, c: [{ d: 1 }, { d: 2 }, { d: 3 }] });
        });
      await request
        .patch('/tests/b')
        .send([{ op: 'move', from: '/a', path: '/b' }])
        .expect(403);
      await request
        .patch('/tests/op2/b')
        .send([{ op: 'move', from: '/a', path: '/b' }])
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal({ id: 'b', b: 3, c: [{ d: 1 }, { e: 1 }, { d: 2, e: 2 }, { d: 3, f: 3 }] });
        });
      await request
        .patch('/tests/op3/b')
        .send([{ op: 'move', from: '/b', path: '/c' }])
        .expect(200)
        .expect('Content-Type', /json/)
        .then(({ body: data }) => {
          data.should.deep.equal({ id: 'b', c: 3 });
        });
    });
  });
});
