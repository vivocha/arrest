import * as chai from 'chai';
import { addConstraint } from '../../dist/mongo/util';

const should = chai.should();

describe('util', function () {
  describe('mongo', function () {
    describe('addConstraint', function () {
      it('should handle an undefined query', function () {
        addConstraint(undefined, undefined).should.deep.equal({});
      });
      it('should ignore a constraint that is not an object', function () {
        const query = {};
        addConstraint(query, undefined).should.equal(query);
        addConstraint(query, 'test').should.equal(query);
      });
      it('should add a simple constraint to an object', function () {
        addConstraint({ a: 1 }, { b: 2 }).should.deep.equal({ a: 1, b: 2 });
      });
      it('should transform a query with a top level $or into a top level $and', function () {
        addConstraint({ a: 1, $or: [{ c: 1 }, { c: 2 }] }, { b: 2 }).should.deep.equal({ $and: [{ a: 1, $or: [{ c: 1 }, { c: 2 }] }, { b: 2 }] });
      });
      it('should push a new constraint into an existing top level $and', function () {
        addConstraint({ a: 1, $and: [{ c: 1 }, { d: 2 }] }, { e: 3 }).should.deep.equal({ a: 1, $and: [{ c: 1 }, { d: 2 }, { e: 3 }] });
      });
      it('should merge two aggregation pipelines', function () {
        addConstraint([{ $match: { a: 1 } }], [{ $project: { aaa: '$aaa' } }]).should.deep.equal([{ $match: { a: 1 } }, { $project: { aaa: '$aaa' } }]);
      });
      it('should add a simple constraint to a $match if it is at the end of a pipeline', function () {
        addConstraint([{ $somestage: {} }, { $match: { a: 1 } }], { b: 2 }).should.deep.equal([{ $somestage: {} }, { $match: { a: 1, b: 2 } }]);
      });
      it('should add a new $match to a pipeline if it has some properties', function () {
        addConstraint([{ $somestage: {} }], { b: 2 }).should.deep.equal([{ $somestage: {} }, { $match: { b: 2 } }]);
        addConstraint([{ $somestage: {} }], {}).should.deep.equal([{ $somestage: {} }]);
      });
      it('ahould transform a query into a pipeline if the constraint is a pipeline', function () {
        addConstraint({ a: 1 }, [{ $somestage: {} }]).should.deep.equal([{ $match: { a: 1 } }, { $somestage: {} }]);
      });
    });
  });
});
