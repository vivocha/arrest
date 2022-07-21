import { ObjectId } from 'bson';
import { parseQuery } from 'rql/parser.js';
import { addConstraint } from './util.js';

export default function (query: any, opts: any, data: string, objectId?: string) {
  return (function _rqlToMongo(query: any, opts: any, data: any) {
    switch (data.name) {
      case 'in':
      case 'out':
        const key = data.args.shift();
        const op = data.name === 'in' ? '$in' : '$nin';
        query = addConstraint(query, { [key]: { [op]: data.args.map((i) => (key === objectId ? new ObjectId(i) : i)) } });
        break;
      case 'contains':
        query = addConstraint(query, { [data.args[0]]: data.args.length > 2 ? data.args.slice(1) : data.args[1] });
        break;
      case 'and':
        if (data.args.length === 1) {
          query = addConstraint(query, _rqlToMongo({}, opts, data.args[0]));
        } else if (data.args.find((i: any) => i.name === 'or' || i.name === 'and')) {
          let constraint: any = { $and: [] };
          data.args.forEach((i) => {
            let _p = _rqlToMongo({}, opts, i);
            if (_p) constraint.$and.push(_p);
          });
          if (constraint.$and.length === 1) {
            constraint = constraint.$and[0];
          }
          query = addConstraint(query, constraint);
        } else {
          data.args.forEach((i) => {
            query = addConstraint(query, _rqlToMongo({}, opts, i));
          });
        }
        break;
      case 'or':
        if (data.args.length === 1) {
          query = addConstraint(query, _rqlToMongo({}, opts, data.args[0]));
        } else {
          let constraint: any = { $or: [] };
          data.args.forEach((i) => {
            let _p = _rqlToMongo({}, opts, i);
            if (_p) constraint.$or.push(_p);
          });
          if (constraint.$or.length === 1) {
            constraint = constraint.$or[0];
          }
          query = addConstraint(query, constraint);
        }
        break;
      case 'not':
        query = addConstraint(query, { $not: _rqlToMongo({}, opts, data.args[0]) });
        break;
      case 'eq':
        query = addConstraint(query, { [data.args[0]]: data.args[0] === objectId ? new ObjectId(data.args[1]) : data.args[1] });
        break;
      case 'lt':
        query = addConstraint(query, { [data.args[0]]: { $lt: data.args[1] } });
        break;
      case 'le':
        query = addConstraint(query, { [data.args[0]]: { $lte: data.args[1] } });
        break;
      case 'gt':
        query = addConstraint(query, { [data.args[0]]: { $gt: data.args[1] } });
        break;
      case 'ge':
        query = addConstraint(query, { [data.args[0]]: { $gte: data.args[1] } });
        break;
      case 'ne':
        query = addConstraint(query, { [data.args[0]]: { $ne: data.args[1] } });
        break;
      case 'matches':
        query = addConstraint(query, { [data.args[0]]: new RegExp(data.args[1], data.args[2]) });
        break;
      case 'text':
        const constraint: any = {
          $text: {
            $search: data.args[0],
          },
        };
        if (data.args[1]) constraint.$text.$language = data.args[1];
        query = addConstraint(query, constraint);
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
  })(query, opts, parseQuery(data));
}
