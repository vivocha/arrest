import { Ability, defineAbility } from '@casl/ability';
import * as chai from 'chai';
import { addConstraint, escapeMongoKey, escapeMongoObject, patchToMongo, removeFields, toMongoQuery, unescapeMongoKey, unescapeMongoObject } from '../../dist/mongo/util.js';

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
      it('should not transform a query with a top level $or into a top level $and', function () {
        addConstraint({ a: 1, $or: [{ c: 1 }, { c: 2 }] }, { b: 2 }).should.deep.equal({ a: 1, $or: [{ c: 1 }, { c: 2 }], b: 2 });
      });
      it('should transform a query with two top level $or into a top level $and', function () {
        addConstraint({ a: 1, $or: [{ c: 1 }, { c: 2 }] }, { $or: [{ b: 1 }, { b: 2 }] }).should.deep.equal({
          $and: [{ a: 1, $or: [{ c: 1 }, { c: 2 }] }, { $or: [{ b: 1 }, { b: 2 }] }],
        });
      });
      it('should push a new constraint into an existing top level $and', function () {
        addConstraint({ a: 1, $and: [] }, { c: 1 }).should.deep.equal({ a: 1, $and: [{ c: 1 }] });
        addConstraint({ a: 1, $and: [{ c: 1 }] }, { d: 2 }).should.deep.equal({ a: 1, $and: [{ c: 1, d: 2 }] });
        addConstraint({ a: 1, $and: [{ c: 1, d: 2 }] }, { $or: [{ e: 3 }, { e: 4 }] }).should.deep.equal({
          a: 1,
          $and: [{ c: 1, d: 2, $or: [{ e: 3 }, { e: 4 }] }],
        });
        addConstraint(
          {
            a: 1,
            $and: [{ c: 1, d: 2, $or: [{ e: 3 }, { e: 4 }] }],
          },
          { $or: [{ f: 5 }, { e: 6 }] }
        ).should.deep.equal({
          a: 1,
          $and: [{ c: 1, d: 2, $or: [{ e: 3 }, { e: 4 }] }, { $or: [{ f: 5 }, { e: 6 }] }],
        });
        addConstraint({ a: 1, $and: [{ c: 1, d: 2 }] }, { $and: [{ e: 3 }, { e: 4 }] }).should.deep.equal({
          a: 1,
          $and: [{ c: 1, d: 2, $and: [{ e: 3 }, { e: 4 }] }],
        });
        addConstraint(
          {
            a: 1,
            $and: [{ c: 1, d: 2, $and: [{ e: 3 }, { e: 4 }] }],
          },
          { $and: [{ f: 5 }, { e: 6 }] }
        ).should.deep.equal({
          a: 1,
          $and: [{ c: 1, d: 2, $and: [{ e: 3 }, { e: 4 }] }, { $and: [{ f: 5 }, { e: 6 }] }],
        });
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
      it('should handle multiple constraints on a property producing an $and', function () {
        addConstraint({ a: 1 }, { a: 2 }).should.deep.equal({ $and: [{ a: 1 }, { a: 2 }] });
        addConstraint({ $and: [{ a: 1 }, { a: 2 }] }, { a: 3 }).should.deep.equal({ $and: [{ a: 1 }, { a: 2 }, { a: 3 }] });
      });
    });
  });

  describe('escapeMongoKey', function () {
    it('should escape characters forbidden in mongo properties', function () {
      escapeMongoKey('$aa.bb.cc.%dd').should.equal('%24aa%2Ebb%2Ecc%2E%25dd');
    });
  });

  describe('unescapeMongoKey', function () {
    it('should restore characters forbidden in mongo properties', function () {
      unescapeMongoKey('%24aa%2Ebb%2Ecc%2E%25dd').should.equal('$aa.bb.cc.%dd');
    });
  });

  describe('escapeMongoObject', function () {
    it('should recursively escape all properties', function () {
      escapeMongoObject({
        $aaa: [{ 'a.b': true }],
        b: { $ccc: true },
        '%d$$': 1,
        e: null,
      }).should.deep.equal({
        '%24aaa': [{ 'a%2Eb': true }],
        b: { '%24ccc': true },
        '%25d%24%24': 1,
        e: null,
      });
    });
  });

  describe('unescapeMongoObject', function () {
    it('should recursively unescape all properties', function () {
      unescapeMongoObject({
        '%24aaa': [{ 'a%2Eb': true }],
        b: { '%24ccc': true },
        '%25d%24%24': 1,
      }).should.deep.equal({
        $aaa: [{ 'a.b': true }],
        b: { $ccc: true },
        '%d$$': 1,
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

  describe('removeFields', function () {
    it('should remove the fields', function () {
      removeFields({ a: 1, _id: 2, _metadata: { b: 3 } }, { _id: [], _metadata: [] }).should.deep.equal({ a: 1 });
    });
    it('should remove the fields from a list of documents', function () {
      removeFields([{ a: 1, _metadata: 2 }, { b: 3 }], { _metadata: [] }).should.deep.equal([{ a: 1 }, { b: 3 }]);
    });
    it('should keep the other fields in the order of the document', function () {
      Object.keys(removeFields({ a: 1, b: 2, c: 3 }, { b: [] })).should.deep.equal(['a', 'c']);
    });
    it('should not change the document', function () {
      const doc = { a: 1, b: { c: 2, d: 3 } };
      removeFields(doc, { a: [], 'b.c': [] }).should.deep.equal({ b: { d: 3 } });
      doc.should.deep.equal({ a: 1, b: { c: 2, d: 3 } });
    });
    it('should remove sub-fields', function () {
      removeFields({ a: { b: 1, c: 2 }, d: 3 }, { 'a.b': [] }).should.deep.equal({ a: { c: 2 }, d: 3 });
    });
    it('should remove sub-fields from every document of an array, leaving the other values', function () {
      removeFields({ a: [{ b: 1, c: 2 }, { b: 3 }, 4, [{ b: 5 }]] }, { 'a.b': [] }).should.deep.equal({ a: [{ c: 2 }, {}, 4, [{}]] });
    });
    it('should ignore missing fields and values that are not documents', function () {
      removeFields({ a: 1, b: null }, { 'a.x': [], 'b.x': [], c: [], 'd.e': [] }).should.deep.equal({ a: 1, b: null });
    });
    it('should not take inherited properties as fields', function () {
      removeFields({ a: 2 }, { constructor: [], 'toString.x': [] }).should.deep.equal({ a: 2 });
    });
    it('should keep the given sub-fields of a field', function () {
      removeFields({ a: { b: 1, c: { d: 2, e: 3 }, f: 4 }, g: 5 }, { a: ['b', 'c.d'] }).should.deep.equal({ a: { b: 1, c: { d: 2 } }, g: 5 });
    });
    it('should keep the given sub-fields of every document of an array, dropping the other values', function () {
      removeFields({ a: [{ b: 1, c: 2 }, { c: 3 }, 4, [{ b: 5 }]] }, { a: ['b'] }).should.deep.equal({ a: [{ b: 1 }, {}, [{ b: 5 }]] });
    });
    it('should drop the sub-fields to keep of values that are not documents', function () {
      removeFields({ a: { b: 1, c: 'x' } }, { a: ['b.x', 'c'] }).should.deep.equal({ a: { c: 'x' } });
    });
    it('should remove a field with sub-fields to keep whose value is null', function () {
      removeFields({ id: 1, a: null }, { a: ['b'] }).should.deep.equal({ id: 1 });
    });
    it('should remove a field with sub-fields to keep whose value is not a document', function () {
      removeFields([{ id: 1, a: 5 }, { id: 2, a: 'x' }], { a: ['b'] }).should.deep.equal([{ id: 1 }, { id: 2 }]);
    });
    it('should not take inherited properties as sub-fields to keep', function () {
      removeFields({ a: { constructor: 1, b: 2 } }, { a: ['b'] }).should.deep.equal({ a: { b: 2 } });
    });
  });

  describe('toMongoQuery', function () {
    it('should avoid extra $or statements', function () {
      const ability = defineAbility((can) => {
        can('action1', 'Test', { a: 1 });
        can('action2', 'Test', { x: 1, y: 1 });
        can('action3', 'Test', { a: 1 });
        can('action3', 'Test', { b: 2 });
      }) as Ability;
      let q = toMongoQuery(ability, 'Test', 'action1');
      q.should.deep.equal({ a: 1 });
      q = toMongoQuery(ability, 'Test', 'action2');
      q.should.deep.equal({ x: 1, y: 1 });
      q = toMongoQuery(ability, 'Test', 'action3');
      q.should.deep.equal({ $or: [{ b: 2 }, { a: 1 }] });
    });
    it('should not fail with an inverted rule with conditions and a rule without conditions', function () {
      const ability = defineAbility((can, cannot) => {
        can('read', 'Test');
        cannot('read', 'Test', { secret: true });
      }) as Ability;
      const q = toMongoQuery(ability, 'Test', 'read');
      q.should.deep.equal({ $and: [{ $nor: [{ secret: true }] }] });
    });
  });
});
