const chai = require('chai')
  , spies = require('chai-spies')
  , should = chai.should()
  , mongo = require('mongodoki')
  , supertest = require('supertest')
  , express = require('express')
  , arrest = require('../dist/index')
  , API = arrest.API
  , MongoResource = arrest.MongoResource
  , MongoOperation = arrest.MongoOperation
  , QueryMongoOperation = arrest.QueryMongoOperation

chai.use(spies);

describe('mongo', function() {

  const md = new mongo.Mongodoki({ reuse: true });

  before(async function() {
    this.timeout(0);
    let db = await md.getDB('local');
    return db.close();
  });

  describe('MongoResource', function() {

    describe('constructor', function() {

      const collectionName = 'arrest_test';
      let db;

      afterEach(async function() {
        let _db;
        if (db) {
          try {
            _db = await db;
            await _db.dropCollection(collectionName);
          } catch (err) {

          } finally {
            await _db.close();
            db = undefined;
          }
        }
      });

      it('should connect to a mongodb via a connection uri', function() {
        let r = new MongoResource('mongodb://localhost:27017/local', { name: 'Test' });
        r.collection.should.equal('tests');
        r.id.should.equal('_id');
        r.idIsObjectId.should.equal(true);
        db = r.db;
        return r.db;
      });

      it('should fail to connect to a wrong connection uri', function() {
        let r = new MongoResource('mongodb://localhost:57017/local', { name: 'Test' });
        return r.db.should.be.rejected;
      });

      it('should use an existing valid db connection', function() {
        let c = mongo.MongoClient.connect('mongodb://localhost:27017/local');
        let r = new MongoResource(c, { name: 'Test' });
        db = r.db;
        return r.db;
      });

      it('should fail with an existing failed db connection', function() {
        let c = mongo.MongoClient.connect('mongodb://localhost:57017/local');
        let r = new MongoResource(c, { name: 'Test' });
        return r.db.should.be.rejected;
      });

      it('should use the specified collection and id parameters', function() {
        let r = new MongoResource('mongodb://localhost:27017/local', { name: 'Test', collection: 'a', id: 'b', idIsObjectId: false });
        r.collection.should.equal('a');
        r.id.should.equal('b');
        r.idIsObjectId.should.equal(false);
        db = r.db;
        return r.db;
      });

      it('should create the required indexes', async function() {
        let r = new MongoResource('mongodb://localhost:27017/local', { name: 'Test', collection: collectionName, id: 'b', idIsObjectId: false });
        r.getIndexes = () => [
          {
            key: { a: 1 },
            unique: true,
            name: 'test1'
          }
        ];

        db = r.db;
        let coll = await r.getCollection();
        let indexes = await coll.indexes();
        return indexes.length.should.equal(2);
      });

      it('should detect existing indexes matching the required ones', async function() {
        let r = new MongoResource('mongodb://localhost:27017/local', { name: 'Test', collection: collectionName, id: 'b', idIsObjectId: false });
        r.getIndexes = () => [
          {
            key: { a: 1 },
            unique: true,
            name: 'test2'
          }
        ];

        db = r.db;
        let coll = (await db).collection(r.collection);
        await coll.createIndex({ a: 1 }, { unique: true, name: 'test2' });

        coll = await r.getCollection();
        let indexes = await coll.indexes();
        return indexes.length.should.equal(2);
      });

      it('should fail if an existing index has different options', async function() {
        let r = new MongoResource('mongodb://localhost:27017/local', { name: 'Test', collection: collectionName, id: 'b', idIsObjectId: false });
        r.getIndexes = () => [
          {
            key: { a: 1 },
            unique: true,
            name: 'test3'
          }
        ];

        db = r.db;
        let coll = (await db).collection(r.collection);
        await coll.createIndex({ a: 1 }, { name: 'test3' });
        await r.getCollection().should.be.rejected;
      });

    });

  });

  describe('MongoOperation', async function() {

    const port = 9876;
    const host = 'localhost:' + port;
    const basePath = 'http://' + host;
    const request = supertest(basePath);
    const app = express();
    const api = new API();
    const collectionName = 'arrest_test';

    class FakeOp1 extends QueryMongoOperation {
      getDefaultInfo(id) {
        let out = super.getDefaultInfo(id);
        delete out.parameters;
        return out;
      }
    }

    class FakeOp2 extends QueryMongoOperation {
      prepareOpts(job) {
        return job;
      }
    }

    let db, id, coll, r1, r2, r3;

    before(async function() {
      db = await mongo.MongoClient.connect('mongodb://localhost:27017/local');
      r1 = new MongoResource(db, { name: 'Test', collection: collectionName });
      r2 = new MongoResource(db, { name: 'Other', collection: collectionName, id: 'myid', idIsObjectId: false });
      r3 = new MongoResource(db, { name: 'Fake', collection: collectionName }, { '/1': { get: FakeOp1 },  '/2': { get: FakeOp2 }});
      api.addResource(r1);
      api.addResource(r2);
      api.addResource(r3);

      let router = await api.router();
      app.use(router);
      server = app.listen(port);
      coll = db.collection(collectionName)
      return coll.createIndex({ myid: 1}, { unique: true });
    });

    after(function() {
      server.close();
      return db.dropCollection(collectionName).then(() => {}, () => {}).then(() => { db.close() });
    });

    it('should install default operation handlers', function() {
      api.paths['/tests'].get.operationId.should.equal('Test.query');
      api.paths['/tests'].post.operationId.should.equal('Test.create');
      api.paths['/tests/{id}'].get.operationId.should.equal('Test.read');
      api.paths['/tests/{id}'].put.operationId.should.equal('Test.update');
      api.paths['/tests/{id}'].delete.operationId.should.equal('Test.remove');
    });

    describe('create', function() {

      it('should create a new record with server generated id', function() {
        return request
          .post('/tests')
          .send({ a: 1, b: true })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function(res) {
            let m = res.headers.location.match(/http:\/\/localhost:9876\/tests\/([a-f0-9]{24})/);
            m[1].length.should.equal(24);
            id = m[1];
          })
          .then(({ body: data }) => {
            return coll.findOne().then(found => {
              data.should.deep.equal(JSON.parse(JSON.stringify(found)));
              data.should.deep.equal({ a: 1, b: true, _id: id });
            });
          });
      });

      it('should create a new record with client generated id', function() {
        return request
          .post('/others')
          .send({ myid: 'aaa', a: 1, b: true })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function(res) {
            res.headers.location.should.equal('http://localhost:9876/others/aaa');
          })
          .then(({ body: data }) => {
            return coll.findOne({ myid: 'aaa'}).then(found => {
              delete found._id;
              data.should.deep.equal(JSON.parse(JSON.stringify(found)));
            });
          });
      });

      it('should fail to create a new record with duplicated id', function() {
        return request
          .post('/others')
          .send({ myid: 'aaa', a: 1, b: true })
          .expect(400)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('duplicate key');
          });
      });

      it('should fail to create a new record with an invalid attribute', function() {
        return request
          .post('/others')
          .send({ myid: 'bbb', ['a.b.c.d']: 1 })
          .expect(500)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('internal');
          });
      });

    });

    describe('collection', function() {

      it('should fail to return a non existent collection in strict mode', function() {

        class TestOperation extends MongoOperation {
          getCollectionOptions() {
            return { strict: true }
          }
        };

        let r = new MongoResource(db, { name: 'Test', collection: 'aaa' });
        let c = new TestOperation('x', r, '/', 'get');
        c.collection.then(() => should.fail(), err => true);
      });

    });

    describe('read', function() {

      it('should return a record by object id', function() {
        return request
          .get('/tests/' + id)
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1, b: true, _id: id });
          });
      });

      it('should return the selected fields of a record by object id', function() {
        return request
          .get(`/tests/${id}?fields=_metadata,a`)
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1 });
          });
      });

      it('should fail with a malformed object id', function() {
        return request
          .get('/tests/x')
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should fail with an unknown object id', function() {
        return request
          .get('/tests/000000000000000000000000')
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should return a record by custom id', function() {
        return request
          .get('/others/aaa')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1, b: true, myid: 'aaa' });
          });
      });

      it('should return the selected fields of a record by custom id', function() {
        return request
          .get('/others/aaa?fields=_id,_metadata,a')
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 1 });
          });
      });

      it('should fail with an unknown custom id', function() {
        return request
          .get('/tests/000')
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

    });

    describe('update', function() {

      it('should update a record by object id', function() {
        return request
          .put('/tests/' + id)
          .send({ a: 2 })
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 2, b: true, _id: id });
          });
      });

      it('should fail with a malformed object id', function() {
        return request
          .put('/tests/x')
          .send({ a: 3 })
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should fail with an unknown object id', function() {
        return request
          .put('/tests/000000000000000000000000')
          .send({ a: 3 })
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

      it('should update a record by custom id', function() {
        return request
          .put('/others/aaa')
          .send({ a: 3 })
          .expect(200)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.should.deep.equal({ a: 3, b: true, myid: 'aaa' });
          });
      });

      it('should fail with an unknown custom id', function() {
        return request
          .put('/tests/000')
          .send({ a: 4 })
          .expect(404)
          .expect('Content-Type', /json/)
          .then(({ body: data }) => {
            data.message.should.equal('not_found');
          });
      });

    });

    describe('query', function() {

      before(function() {
        return Promise.all([
          request.post('/tests').send({  myid: 'test2', y: 11, z: false, p: 'bbb' }).expect(201),
          request.post('/tests').send({  myid: 'test3', y: 30, z: false }).expect(201),
          request.post('/tests').send({  myid: 'test1', y: 13, z: true, p: 'aaa' }).expect(201),
          request.post('/tests').send({  myid: 'test4', y: 20, p: 'ddd' }).expect(201)
        ]);
      });

      it('should return all objects in the collection (1)', function() {
        return request
          .get('/tests')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(6);
          });
      });

      it('should return all objects in the collection (2)', function() {
        return request
          .get('/fakes/1')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(6);
          });
      });

      it('should return all objects in the collection (3)', function() {
        return request
          .get('/fakes/2')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(6);
          });
      });

      it('should return a single attribute of all objects, in ascending order by id (1)', function() {
        return request
          .get('/tests?fields=y&sort=myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 13 });
            data[1].should.deep.equal({ y: 11 });
            data[2].should.deep.equal({ y: 30 });
            data[3].should.deep.equal({ y: 20 });
          });
      });

      it('should return a single attribute of all objects, in ascending order by id (2)', function() {
        return request
          .get('/tests?fields=y&sort=%2Bmyid') // +myid
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 13 });
            data[1].should.deep.equal({ y: 11 });
            data[2].should.deep.equal({ y: 30 });
            data[3].should.deep.equal({ y: 20 });
          });
      });

      it('should return a single attribute of all objects, in descending order by id (1)', function() {
        return request
          .get('/tests?fields=y,&sort=-myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 20 });
            data[1].should.deep.equal({ y: 30 });
            data[2].should.deep.equal({ y: 11 });
            data[3].should.deep.equal({ y: 13 });
          });
      });

      it('should return a single attribute of all objects, in descending order by id (2)', function() {
        return request
          .get('/others?fields=y,_id&sort=-myid')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(4);
            data[0].should.deep.equal({ y: 20 });
            data[1].should.deep.equal({ y: 30 });
            data[2].should.deep.equal({ y: 11 });
            data[3].should.deep.equal({ y: 13 });
          });
      });

      it('should return the _id and a specified attribute (if available) of all objects', function() {
        return request
          .get('/tests?fields=y,_id')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .then(({ body: data }) => {
            data.length.should.equal(6);
            data[0]._id.should.be.a('string');
            data[1]._id.should.be.a('string');
            data[2]._id.should.be.a('string');
            data[3]._id.should.be.a('string');
          });
      });

      it('should skip and limit the results', function() {
        return request
          .get('/tests?limit=2&skip=3')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '6')
          .expect('Results-Skipped', '3')
          .then(({ body: data }) => {
            data.length.should.equal(2);
          });
      });

      it('should return zero results with an invalid query', function() {
        return request
          .get('/tests?q=eq($__$,0)')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect('Results-Matching', '0');
      });

    });

    describe('remove', function() {

      it('should remove a resource by object', function() {
        return request
          .delete('/tests/' + id)
          .expect(200)
          .then(({ body: data }) => {
            data.should.deep.equal({ });
          });
      });

      it('should fail to removed an unknown resource', function() {
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

});
