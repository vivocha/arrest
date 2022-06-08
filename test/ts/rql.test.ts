import { ObjectId } from 'bson';
import chai from 'chai';
import spies from 'chai-spies';
import rql from '../../dist/mongo/rql.js';

chai.should();
chai.use(spies);

describe('rql', function () {
  it('should parse "in"', function () {
    let query = rql({}, {}, 'in(x,a,b,c)');
    query.x.should.deep.equal({ $in: ['a', 'b', 'c'] });
  });

  it('should parse "contains"', function () {
    let query = rql({}, {}, 'contains(x,aaa)');
    query.x.should.equal('aaa');

    query = rql({}, {}, 'contains(x,aaa,bbb,ccc)');
    query.x.should.deep.equal(['aaa', 'bbb', 'ccc']);
  });

  it('should parse "and"', function () {
    let query1 = rql({}, {}, 'and(eq(x,b))');
    let query2 = rql({}, {}, 'eq(x,b)');
    query1.should.deep.equal(query2);
    query1.should.deep.equal({ x: 'b' });
    let query3 = rql({}, {}, 'and(eq(x,b),eq(y,c))');
    query3.should.deep.equal({ x: 'b', y: 'c' });
    let query4 = rql({}, {}, 'and(and(eq(x,b),eq(y,c)),in(z,a,b),aggregate())');
    query4.should.deep.equal({ $and: [{ x: 'b', y: 'c' }, { z: { $in: ['a', 'b'] } }] });
    let query5 = rql({}, {}, 'and(and(eq(x,b)),aggregate())');
    query5.should.deep.equal({ x: 'b' });
  });

  it('should parse "or"', function () {
    let query1 = rql({}, {}, 'or(eq(x,b))');
    let query2 = rql({}, {}, 'eq(x,b)');
    query1.should.deep.equal(query2);
    query1.should.deep.equal({ x: 'b' });
    let query3 = rql({}, {}, 'or(eq(x,b),eq(y,c))');
    query3.should.deep.equal({ $or: [{ x: 'b' }, { y: 'c' }] });
    let query4 = rql({}, {}, 'or(and(eq(x,b),eq(y,c)),in(z,a,b),aggregate())');
    query4.should.deep.equal({ $or: [{ x: 'b', y: 'c' }, { z: { $in: ['a', 'b'] } }] });
    let query5 = rql({}, {}, 'or(or(eq(x,b)),aggregate())');
    query5.should.deep.equal({ x: 'b' });
  });

  it('should parse "eq"', function () {
    let query = rql({}, {}, 'eq(x,a)');
    query.should.deep.equal({ x: 'a' });
  });

  it('should parse "lt"', function () {
    let query = rql({}, {}, 'lt(x,a)');
    query.should.deep.equal({ x: { $lt: 'a' } });
  });

  it('should parse "le"', function () {
    let query = rql({}, {}, 'le(x,a)');
    query.should.deep.equal({ x: { $lte: 'a' } });
  });

  it('should parse "gt"', function () {
    let query = rql({}, {}, 'gt(x,a)');
    query.should.deep.equal({ x: { $gt: 'a' } });
  });

  it('should parse "ge"', function () {
    let query = rql({}, {}, 'ge(x,a)');
    query.should.deep.equal({ x: { $gte: 'a' } });
  });

  it('should parse "ne"', function () {
    let query = rql({}, {}, 'ne(x,a)');
    query.should.deep.equal({ x: { $ne: 'a' } });
  });

  it('should parse "matches"', function () {
    let query = rql({}, {}, 'matches(x,a)');
    query.should.deep.equal({ x: /a/ });
    query = rql({}, {}, 'matches(x,a,i)');
    query.should.deep.equal({ x: /a/i });
    query = rql({}, {}, 'matches(x,a,ig)');
    query.should.deep.equal({ x: /a/gi });
  });

  it('should parse "text"', function () {
    let query = rql({}, {}, 'text(aaaaa)');
    query.should.deep.equal({ $text: { $search: 'aaaaa' } });
    query = rql({}, {}, 'text(aaaaa,it)');
    query.should.deep.equal({ $text: { $search: 'aaaaa', $language: 'it' } });
  });

  it('should parse "sort"', function () {
    let opts: any = {};
    rql({}, opts, 'sort(a,b)');
    opts.sort.should.deep.equal(['a', 'b']);
  });

  it('should parse "select"', function () {
    let opts: any = {};
    rql({}, opts, 'select(a,b)');
    opts.fields.should.deep.equal(['a', 'b']);
  });

  it('should parse "limit"', function () {
    let opts: any = {};
    rql({}, opts, 'limit(a,b)');
    opts.skip.should.equal('a');
    opts.limit.should.equal('b');
  });

  it('should handle object ids', function () {
    let query = rql({}, {}, 'eq(_id,604784e36b026ce483a9a8ea)', '_id');
    query._id.should.be.instanceof(ObjectId);
    query = rql({}, {}, 'in(_id,604784e36b026ce483a9a8ea,604784e36b026ce483a9a8eb)', '_id');
    query._id.$in[0].should.be.instanceof(ObjectId);
    query._id.$in[1].should.be.instanceof(ObjectId);
  });
});
