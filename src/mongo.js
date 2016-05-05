import url from 'url';
import _ from 'lodash';
import { default as log4js } from 'log4js';
import { MongoClient, ObjectId } from 'mongodb';
import { parseQuery as rqlParser } from 'rql/parser';
import { Resource } from './resource';
import { API } from './api';

var logger = log4js.getLogger("arrest.mongo");

function rqlToMongo(query, opts, data) {
  switch(data.name) {
    case 'in':
      query[data.args[0]] = { $in: data.args.slice(1) };
      break;
    case 'contains':
      query[data.args[0]] = data.args.length > 2 ? data.args.slice(1) : data.args[1];
      break;
    case 'and':
      if (data.args.length === 1) {
        rqlToMongo(query, opts, data.args[0]);
      } else if (_.find(data.args, function(i) { return i.name === 'or' || i.name === 'and' })) {
        query.$and = [];
        _.each(data.args, function(i) {
          var _p = rqlToMongo({}, opts, i);
          if (_p) query.$and.push(_p);
        });
        if (query.$and.length === 1) {
          query = query.$and[0];
        }
      } else {
        _.each(data.args, function(i) {
          rqlToMongo(query, opts, i);
        });
      }
      break;
    case 'or':
      if (data.args.length === 1) {
        rqlToMongo(query, opts, data.args[0]);
      } else {
        query.$or = [];
        _.each(data.args, function (i) {
          var _p = rqlToMongo({}, opts, i);
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
      break;
  }
  return query;
}

export class MongoResource extends Resource {
  constructor(api, resource) {
    super(api, resource);
    if (!this.collection) {
      this.collection = this.namePlural.toLocaleLowerCase();
    }
    this.maxScan = MongoResource.MAX_SCAN;
    this.maxCountMs = MongoResource.MAX_COUNT_MS;
    if (typeof this.db === 'string') {
      this.db = MongoClient.connect(this.db);
    } else {
      this.db = Promise.resolve(this.db);
    }
    // TODO find a way to validate "resource" with the schema in order to access default values
    // We're currently not doing it because "validate" would resolve $ref's and we need them to stay
    // unresolved (the API handler will resolve them after the generation of swagger.json)
    if (typeof this.id !== 'string') {
      this.id = '_id';
    }
    if (typeof this.idIsObjectId !== 'boolean') {
      this.idIsObjectId = true;
    }
  }
  getCollection(opts) {
    return this.db.then(db => {
      return db.collection(this.collection, opts);
    });
  }
  getItemQuery(id) {
    return {
      [ this.id ]: (this.idIsObjectId ? new ObjectId(id) : id)
    };
  }

  queryPrepareQuery(req) {
    var q = {};
    if (req.query.q) {
      req.queryOpts = {};
      q = rqlToMongo(q, req.queryOpts, rqlParser(req.query.q));
    }
    return q;
  }
  queryPrepareOpts(req) {
    var opts = req.queryOpts || {};

    if (typeof req.query.limit !== 'undefined') {
      opts.limit = req.query.limit;
    }
    if (typeof req.query.skip !== 'undefined') {
      opts.skip = req.query.skip;
    }
    if (req.query.fields) {
      opts.fields = req.query.fields;
    }
    if (opts.fields) {
      opts.fields = _.reduce(opts.fields, function(o, i) {
        o[i] = 1;
        return o;
      }, {});
      delete opts.fields._metadata;
    } else {
      opts.fields = { _metadata: 0 }
    }
    if (this.id !== '_id') {
      opts.fields._id = 0;
    }

    if (req.query.sort) {
      opts.sort = req.query.sort;
    }
    if (opts.sort) {
      opts.sort = _.reduce(opts.sort, function(o, i) {
        if (i[0] === '-') {
          o[i.substr(1)] = -1;
        } else if (i[0] === '+') {
          o[i.substr(1)] = 1;
        } else {
          o[i] = 1;
        }
        return o;
      }, {});
    }

    return opts;
  }
  query(req, res) {
    this.getCollection().then(collection => {
      var q = this.queryPrepareQuery(req);
      var opts = this.queryPrepareOpts(req);
      logger.debug('query', q);
      logger.debug('opts', opts);

      var cursor = collection.find(q);
      cursor.maxScan(this.maxScan);

      // false = ignore limit and skip when counting
      return cursor.count(false, {
        maxTimeMS: this.maxCountMs
      }).then(matching => {
        res.set('Results-Matching', matching);
        return matching;
      }, () => {
        return 0;
      }).then(matching => {
        if (opts.fields) cursor.project(opts.fields);
        if (opts.sort) cursor.sort(opts.sort);
        if (opts.limit) cursor.limit(opts.limit);
        if (opts.skip) cursor.skip(opts.skip);
        return cursor.toArray().then(data => {
          if (opts.skip) {
            res.set('Results-Skipped', opts.skip);
          }
          if (opts.skip + opts.limit < matching) {
            var q = url.parse(req.originalUrl, true).query || {};
            q.limit = opts.limit;
            q.skip = opts.skip + opts.limit;
            res.set('Link', '<' + Resource.getFullURL(req) + '?' + Resource.toQueryString(q) + '>; rel="next"');
          }
          res.jsonp(data);
        });
      });
    }).catch(err => {
      API.handleError(err, req, res);
    });
  }

  readPrepareQuery(req) {
    return this.getItemQuery(req.params.id)
  }
  readPrepareOpts(req) {
    var opts = {};
    if (req.query.fields) {
      opts.fields = req.query.fields;
      delete opts.fields._metadata;
    } else {
      opts.fields = { _metadata: 0 }
    }
    if (this.id !== '_id') {
      opts.fields._id = 0;
    }
    return opts;
  }
  read(req, res) {
    this.getCollection().then(collection => {
      var q = this.readPrepareQuery(req);
      var opts = this.readPrepareOpts(req);
      logger.debug('query', q);
      logger.debug('opts', opts);
      return collection.find(q, opts).limit(1).next().then(data => {
        if (data) {
          res.jsonp(data);
        } else {
          API.fireError(404, 'not_found');
        }
      });
    }).catch(err => {
      API.handleError(err, req, res);
    });
  }

  createPrepareDoc(req) {
    var out = _.cloneDeep(req.body);
    delete out[this.id];
    delete out._metadata;
    return out;
  }
  createPrepareOpts(req) {
    return {};
  }
  create(req, res) {
    this.getCollection().then(collection => {
      var doc = this.createPrepareDoc(req);
      var opts = this.createPrepareOpts(req);
      logger.debug('doc', doc);
      logger.debug('opts', opts);
      return collection.insertOne(doc, opts).then(result => {
        if (result.insertedCount != 1) {
          console.error('insert failed', result);
          API.fireError(500, 'failed');
        } else if (!result.ops || result.ops.length !== 1) {
          console.error('bad result', result);
          API.fireError(500, 'internal');
        } else {
          var obj = result.ops[0];
          var id = result.ops[0][this.id];
          if (this.id !== '_id') {
            delete obj._id;
          }
          delete obj._metadata;
          res.set('Location', Resource.getFullURL(req) + '/' + id);
          res.status(201).jsonp(obj);
        }
      });
    }).catch(err => {
      API.handleError(err, req, res);
    });
  }

  updatePrepareQuery(req) {
    return this.getItemQuery(req.params.id)
  }
  updatePrepareDoc(req) {
    var out = _.cloneDeep(req.body);
    delete out[this.id];
    delete out._metadata;
    return { $set: out };
  }
  updatePrepareOpts(req) {
    return { returnOriginal: false };
  }
  update(req, res) {
    this.getCollection().then(collection => {
      var q = this.updatePrepareQuery(req);
      var doc = this.updatePrepareDoc(req);
      var opts = this.updatePrepareOpts(req);
      logger.debug('query', q);
      logger.debug('doc', doc);
      logger.debug('opts', opts);
      return collection.findOneAndUpdate(q, doc, opts).then(result => {
        if (!result.ok || !result.value) {
          console.error('update failed', result);
          API.fireError(404, 'not_found');
        } else {
          var obj = result.value;
          if (this.id !== '_id') {
            delete obj._id;
          }
          delete obj._metadata;
          res.jsonp(obj);
        }
      });
    }).catch(err => {
      API.handleError(err, req, res);
    });
  }

  removePrepareQuery(req) {
    return this.getItemQuery(req.params.id)
  }
  removePrepareOpts(req) {
    return {};
  }
  remove(req, res) {
    this.getCollection().then(collection => {
      var q = this.removePrepareQuery(req);
      var opts = this.removePrepareOpts(req);
      logger.debug('query', q);
      logger.debug('opts', opts);
      return collection.deleteOne(q, opts).then(result => {
        if (result.deletedCount != 1) {
          console.error('delete failed', result);
          API.fireError(404, 'not_found');
        } else {
          res.end();
        }
      });
    }).catch(err => {
      API.handleError(err, req, res);
    });
  }
}

// TODO fine tune these values
MongoResource.MAX_SCAN = 200;
MongoResource.MAX_COUNT_MS = 200;
