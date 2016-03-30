import url from 'url';
import _ from 'lodash';
import { MongoClient, ObjectId } from 'mongodb';
import { Resource } from './resource';
import { API } from './api';

export class MongoResource extends Resource {
  constructor(api, resource) {
    super(api, resource);
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
    return {};
  }
  queryPrepareOpts(req) {
    var opts = {};
    if (req.query.fields) {
      opts.fields = req.query.fields;
    }
    return opts;
  }
  query(req, res) {
    this.getCollection().then(collection => {
      var cursor = collection.find(this.queryPrepareQuery(req), this.queryPrepareOpts(req));
      if (req.query.skip) {
        cursor.skip(req.query.skip);
      }
      return cursor.count().then(matching => {
        res.set('Results-Matching', matching);
        if (req.query.skip) {
          res.set('Results-Skipped', req.query.skip);
        }
        if (req.query.limit) {
          cursor.limit(req.query.limit);
          if (req.query.skip + req.query.limit < matching) {
            var q = url.parse(req.originalUrl, true).query || {};
            q.limit = req.query.limit;
            q.skip = req.query.skip + req.query.limit;
            res.set('Link', '<' + Resource.getFullURL(req) + '?' + Resource.toQueryString(q) + '>; rel="next"');
          }
        }
        return cursor.toArray().then(data => {
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
    }
    return opts;
  }
  read(req, res) {
    this.getCollection().then(collection => {
      return collection.find(this.readPrepareQuery(req), this.readPrepareOpts(req)).limit(1).next().then(data => {
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
    return _.cloneDeep(req.body);
  }
  createPrepareOpts(req) {
    return {};
  }
  create(req, res) {
    this.getCollection().then(collection => {
      return collection.insertOne(this.createPrepareDoc(req), this.createPrepareOpts(req)).then(result => {
        if (result.insertedCount != 1) {
          console.error('insert failed', result);
          API.fireError(500, 'failed');
        } else if (!result.ops || result.ops.length !== 1) {
          console.error('bad result', result);
          API.fireError(500, 'internal');
        } else {
          res.set('Location', Resource.getFullURL(req) + '/' + result.insertedId);
          res.status(201).jsonp(result.ops[0])
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
    return _.cloneDeep(req.body);
  }
  updatePrepareOpts(req) {
    return { returnOriginal: false };
  }
  update(req, res) {
    this.getCollection().then(collection => {
      return collection.findOneAndUpdate(this.updatePrepareQuery(req), this.updatePrepareDoc(req), this.updatePrepareOpts(req)).then(result => {
        if (!result.ok || !result.value) {
          console.error('update failed', result);
          API.fireError(404, 'not_found');
        } else {
          res.jsonp(result.value);
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
      return collection.deleteOne(this.removePrepareQuery(req), this.removePrepareOpts(req)).then(result => {
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