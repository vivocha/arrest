import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import { PatchMongoOperation } from '../../dist/mongo/operation/patch.js';
import { UpdateMongoOperation } from '../../dist/mongo/operation/update.js';
import { MongoResource } from '../../dist/mongo/resource.js';

chai.use(chaiAsPromised);
const should = chai.should();

/**
 * Build a minimal MongoJob-like object sufficient to exercise redactResult().
 * We bypass the full pipeline (no HTTP, no MongoDB) by calling redactResult() directly.
 */
function makeJob(data: any, resourceInfo: Partial<{ id: string; idIsObjectId: boolean; escapeProperties: boolean }> = {}) {
  return {
    data,
    req: { logger: { error: () => {} } } as any,
    res: {} as any,
    feat: {},
    query: {},
    doc: {},
    opts: {},
    coll: {} as any,
  } as any;
}

function makeOperation(resourceInfo: Partial<{ id: string; idIsObjectId: boolean; escapeProperties: boolean }> = {}) {
  // Build a minimal MongoResource stub — we only need `info` and `getCollection`.
  const info = {
    name: 'Test',
    namePlural: 'tests',
    id: '_id',
    idIsObjectId: true,
    escapeProperties: false,
    ...resourceInfo,
  };
  const resource = {
    info,
    getCollection: sinon.stub().resolves({}),
    requestSchema: {},
    responseSchema: {},
    scopes: undefined,
  } as unknown as MongoResource;
  return new UpdateMongoOperation(resource, '/tests/:id', 'put');
}

describe('UpdateMongoOperation', function () {
  describe('redactResult()', function () {
    it('should delete _id when resource id is not "_id"', async function () {
      const op = makeOperation({ id: 'myid', idIsObjectId: false });
      const job = makeJob({ _id: 'mongo-internal-id', myid: 'aaa', _metadata: { v: 1 }, a: 1 });
      const result = await op.redactResult(job);
      result.data.should.not.have.property('_id');
      result.data.should.not.have.property('_metadata');
      result.data.should.have.property('a', 1);
    });

    it('should keep _id when resource id is "_id"', async function () {
      const op = makeOperation({ id: '_id', idIsObjectId: true });
      const job = makeJob({ _id: 'some-id', _metadata: { v: 1 }, a: 2 });
      const result = await op.redactResult(job);
      result.data.should.have.property('_id');
      result.data.should.not.have.property('_metadata');
    });

    it('should resolve without throwing when job.data is null (null guard)', async function () {
      // Simulates findOneAndUpdate returning null when document is not found
      // and execution somehow continues past API.fireError (e.g. in subclasses).
      // Before the fix: TypeError: Cannot convert undefined or null to object.
      const op = makeOperation();
      const job = makeJob(null);
      await op.redactResult(job).should.be.fulfilled;
    });
  });
});

describe('PatchMongoOperation', function () {
  describe('redactResult()', function () {
    it('should delete _id when resource id is not "_id"', async function () {
      const resource = {
        info: { name: 'Test', namePlural: 'tests', id: 'myid', idIsObjectId: false, escapeProperties: false },
        getCollection: sinon.stub().resolves({}),
        requestSchema: {},
        responseSchema: {},
        scopes: undefined,
      } as unknown as MongoResource;
      const op = new PatchMongoOperation(resource, '/tests/:id', 'patch');
      const job = makeJob({ _id: 'internal', myid: 'aaa', _metadata: { v: 1 }, a: 1 });
      const result = await op.redactResult(job);
      result.data.should.not.have.property('_id');
      result.data.should.not.have.property('_metadata');
      result.data.should.have.property('a', 1);
    });

    it('should resolve without throwing when job.data is null (null guard)', async function () {
      const resource = {
        info: { name: 'Test', namePlural: 'tests', id: '_id', idIsObjectId: true, escapeProperties: false },
        getCollection: sinon.stub().resolves({}),
        requestSchema: {},
        responseSchema: {},
        scopes: undefined,
      } as unknown as MongoResource;
      const op = new PatchMongoOperation(resource, '/tests/:id', 'patch');
      const job = makeJob(null);
      await op.redactResult(job).should.be.fulfilled;
    });
  });
});
