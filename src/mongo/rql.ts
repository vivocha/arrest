import * as _ from 'lodash';

const rqlParser = require('rql/parser').parseQuery;

export default function(query:any, opts:any, data:string) {
  return _rqlToMongo(query, opts, rqlParser(data));
}

function _rqlToMongo(query:any, opts:any, data:any) {
  switch(data.name) {
    case 'in':
      query[data.args[0]] = { $in: data.args.slice(1) };
      break;
    case 'contains':
      query[data.args[0]] = data.args.length > 2 ? data.args.slice(1) : data.args[1];
      break;
    case 'and':
      if (data.args.length === 1) {
        query = _rqlToMongo(query, opts, data.args[0]);
      } else if (_.find(data.args, (i: any) => i.name === 'or' || i.name === 'and')) {
        query.$and = [];
        _.each(data.args, function(i) {
          let _p = _rqlToMongo({}, opts, i);
          if (_p) query.$and.push(_p);
        });
        if (query.$and.length === 1) {
          query = query.$and[0];
        }
      } else {
        _.each(data.args, function(i) {
          query = _rqlToMongo(query, opts, i);
        });
      }
      break;
    case 'or':
      if (data.args.length === 1) {
        query = _rqlToMongo(query, opts, data.args[0]);
      } else {
        query.$or = [];
        _.each(data.args, function (i) {
          let _p = _rqlToMongo({}, opts, i);
          if (_p) query.$or.push(_p);
        });
        if (query.$or.length === 1) {
          query = query.$or[0];
        }
      }
      break;
    case 'eq':
      query[data.args[0]] = data.args[1];
      break;
    case 'lt':
      query[data.args[0]] = { $lt: data.args[1] };
      break;
    case 'le':
      query[data.args[0]] = { $lte: data.args[1] };
      break;
    case 'gt':
      query[data.args[0]] = { $gt: data.args[1] };
      break;
    case 'ge':
      query[data.args[0]] = { $gte: data.args[1] };
      break;
    case 'ne':
      query[data.args[0]] = { $ne: data.args[1] };
      break;
    case 'matches':
      query[data.args[0]] = new RegExp(data.args[1]);
      break;

    case 'sort':
      query = null;
      opts.sort = data.args;
      break;
    case 'select':
      query = null;
      opts.fields = data.args;
      break;
    case 'limit':
      query = null;
      opts.skip = data.args[0];
      opts.limit = data.args[1];
      break;

    case 'aggregate':
    case 'distinct':
    case 'sum':
    case 'mean':
    case 'max':
    case 'min':
    case 'recurse':
    default:
      query = null;
      break;
  }
  return query;
}
