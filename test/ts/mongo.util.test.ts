import * as chai from 'chai';
import { addConstraint, escapeMongoKey, escapeMongoObject, patchToMongo, unescapeMongoKey, unescapeMongoObject } from '../../dist/mongo/util';

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

  describe('escapeMongoKey', function() {
    it('should escape characters forbidden in mongo properties', function () {
      escapeMongoKey('$aa.bb.cc.%dd').should.equal('%24aa%2Ebb%2Ecc%2E%25dd');
    });
  });

  describe('unescapeMongoKey', function() {
    it('should restore characters forbidden in mongo properties', function () {
      unescapeMongoKey('%24aa%2Ebb%2Ecc%2E%25dd').should.equal('$aa.bb.cc.%dd');
    });
  });

  describe('escapeMongoObject', function() {
    it('should recursively escape all properties', function() {
      escapeMongoObject({
        "$aaa": [ { "a.b": true}],
        "b": { "$ccc": true },
        "%d$$": 1,
        "e": null
      }).should.deep.equal({
        "%24aaa": [ { "a%2Eb": true }],
        "b": { "%24ccc": true },
        "%25d%24%24": 1,
        "e": null
      });
    });
  });

  describe('unescapeMongoObject', function() {
    it('should recursively unescape all properties', function() {
      unescapeMongoObject({
        "%24aaa": [ { "a%2Eb": true }],
        "b": { "%24ccc": true },
        "%25d%24%24": 1
      }).should.deep.equal({
        "$aaa": [ { "a.b": true}],
        "b": { "$ccc": true },
        "%d$$": 1
      });
    });
  });

  describe('patchToMongo', function () {
    describe('add', function () {
      it("should convert 'add' into $set", function () {
        patchToMongo([
          { op: 'add', path: '/a', value: 1 },
          { op: 'add', path: '/b', value: 2 },
        ]).should.deep.equal({ doc: { $set: { a: 1, b: 2 } } });
        patchToMongo([{ op: 'add', path: '/a/0', value: 1 }]).should.deep.equal({ doc: { $set: { 'a.0': 1 } } });
      });
      it("should convert 'add' into $push", function () {
        patchToMongo([
          { op: 'add', path: '/a/-', value: 1 },
          { op: 'add', path: '/b/-', value: 2 },
        ]).should.deep.equal({ doc: { $push: { a: 1, b: 2 } } });
      });
      it('should fail with an empty path', function () {
        should.Throw(function () {
          patchToMongo([{ op: 'add', path: '', value: 1 }]);
        }, 'path cannot be empty');
      });
      it('should fail to $push at root', function () {
        should.Throw(function () {
          patchToMongo([{ op: 'add', path: '/-', value: 1 }]);
        }, "cannot use '-' index at root of path");
      });
    });
    describe('replace', function () {
      it("should convert 'replace' into $set and query", function () {
        patchToMongo([
          { op: 'replace', path: '/a', value: 1 },
          { op: 'replace', path: '/b', value: 2 },
        ]).should.deep.equal({ doc: { $set: { a: 1, b: 2 } }, query: { a: { $exists: true }, b: { $exists: true } } });
      });
      it("should fail with a '-' index", function () {
        should.Throw(function () {
          patchToMongo([{ op: 'replace', path: '/-', value: 1 }]);
        }, "cannot use '-' index in path of replace");
      });
    });
    describe('move', function () {
      it("should convert 'move' into $replace", function () {
        patchToMongo([
          { op: 'move', from: '/a', path: '/b' },
          { op: 'move', from: '/c.d', path: '/e' },
        ]).should.deep.equal({ doc: { $rename: { a: 'b', 'c.d': 'e' } } });
      });
      it("should fail with a '-' index", function () {
        should.Throw(function () {
          patchToMongo([{ op: 'move', from: '/a/-', path: '/b' }]);
        }, "cannot use '-' index in from path of move");
        should.Throw(function () {
          patchToMongo([{ op: 'move', from: '/a', path: '/b/-' }]);
        }, "cannot use '-' index in path of move");
      });
      it('should fail with an empty from path', function () {
        should.Throw(function () {
          patchToMongo([{ op: 'move', from: '', path: '/b' }]);
        }, 'from path cannot be empty');
      });
    });
    describe('remove', function () {
      it("should convert 'remove' into $unset", function () {
        patchToMongo([
          { op: 'remove', path: '/a' },
          { op: 'remove', path: '/b' },
        ]).should.deep.equal({ doc: { $unset: { a: 1, b: 1 } } });
      });
      it("should fail with a '-' index", function () {
        should.Throw(function () {
          patchToMongo([{ op: 'remove', path: '/-' }]);
        }, "cannot use '-' index in path of remove");
      });
    });
    describe('copy', function () {
      it('should fail', function () {
        should.Throw(function () {
          patchToMongo([{ op: 'copy', from: '/a', path: '/b' }]);
        }, 'copy not supported');
      });
    });
    describe('test', function () {
      it("should convert 'test' into a query", function () {
        patchToMongo([
          { op: 'test', path: '/a', value: 1 },
          { op: 'test', path: '/b', value: 2 },
        ]).should.deep.equal({ query: { a: 1, b: 2 } });
      });
      it("should fail with a '-' index", function () {
        should.Throw(function () {
          patchToMongo([{ op: 'test', path: '/-', value: 1 }]);
        }, "cannot use '-' index in path of test");
      });
    });
  });
});
