import { default as _ } from 'underscore';
import { register as jpdefine } from 'jsonpolice';
import { MongoClient, ObjectId } from 'mongodb';
import { RESTResource } from './rest'

jpdefine('MongoResourceOptions', {
  value: {
    db: {
      type: 'object',
      required: true,
      transform: function(v) {
        if (typeof v === 'string') {
          return MongoClient.connect(v);
        } else {
          return Promise.resolve(v);
        }
      }
    },
    collection: {
      type: 'string',
      required: true
    },
    id: {
      type: 'string',
      required: true,
      default: '_id'
    },
    idIsObjectId: {
      type: 'boolean',
      required: true,
      default: true
    }
  }
}, 'ResourceOptions');

export class MongoResource extends RESTResource {
  constructor(_options) {
    super(_options, 'MongoResourceOptions');
  }
  collection(opts) {
    return this.options.db.then(db => {
      return db.collection(this.options.collection, opts);
    });
  }
  getItemQuery(id) {
    return {
      [ this.options.id ]: (this.options.idIsObjectId ? new ObjectId(id) : id)
    };
  }

  getQueryManyQuery(req) {
    return {};
  }
  getQueryManyOpts(req) {
    var opts = {};
    if (req.query.fields) {
      opts.fields = req.query.fields;
    }
    return opts;
  }
  query(req, res) {
    this.collection().then(collection => {
      var cursor = collection.find(this.getQueryManyQuery(req), this.getQueryManyOpts(req));
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
            var q = _.clone(req.originalQuery);
            q.limit = req.query.limit;
            q.skip = req.query.skip + req.query.limit;
            res.set('Link', '<' + RESTResource.getFullURL(req) + '?' + RESTResource.toQueryString(q) + '>; rel="next"');
          }
        }
        return cursor.toArray().then(data => {
          res.jsonp(data);
        });
      });
    }).catch(err => {
      this.handleError(err, req, res);
    });
  }

  getReadQuery(req) {
    return this.getItemQuery(req.params.id)
  }
  getReadOpts(req) {
    var opts = {};
    if (req.query.fields) {
      opts.fields = req.query.fields;
    }
    return opts;
  }
  read(req, res) {
    this.collection().then(collection => {
      return collection.find(this.getReadQuery(req), this.getReadOpts(req)).limit(1).next().then(data => {
        if (data) {
          res.jsonp(data);
        } else {
          this.fireError(404, 'not_found');
        }
      });
    }).catch(err => {
      this.handleError(err, req, res);
    });
  }

  getCreateDoc(req) {
    return req.body;
  }
  getCreateOpts(req) {
    return {};
  }
  create(req, res) {
    console.log('create', req.body);
    this.collection().then(collection => {
      return collection.insertOne(this.getCreateDoc(req), this.getCreateOpts(req)).then(result => {
        if (result.insertedCount != 1) {
          console.error('insert failed', result);
          this.fireError(500, 'failed');
        } else if (!result.ops || result.ops.length !== 1) {
          console.error('bad result', result);
          this.fireError(500, 'internal');
        } else {
          res.set('Location', RESTResource.getFullURL(req) + result.insertedId);
          res.status(201).jsonp(result.ops[0])
        }
      });
    }).catch(err => {
      this.handleError(err, req, res);
    });
  }

  getUpdateManyQuery(req) {
    return {};
  }
  getUpdateManyOpts(req) {
    return {};
  }
  updateMany(req, res) {
    this.fireError(501, 'not_implemented');
  }

  getUpdateOneQuery(req) {
    return this.getItemQuery(req.params.id)
  }
  getUpdateOneDoc(req) {
    if (req.body[this.options.id]) {
      delete req.body[this.options.id];
    }
    return req.body;
  }
  getUpdateOneOpts(req) {
    return { returnOriginal: false };
  }
  updateOne(req, res) {
    this.collection().then(collection => {
      return collection.findOneAndUpdate(this.getUpdateOneQuery(req), this.getUpdateOneDoc(req), this.getUpdateOneOpts(req)).then(result => {
        if (!result.ok || !result.value) {
          console.error('update failed', result);
          this.fireError(404, 'not_found');
        } else {
          res.jsonp(result.value);
        }
      });
    }).catch(err => {
      this.handleError(err, req, res);
    });
  }

  getDeleteManyQuery(req) {
    return {};
  }
  getDeleteManyOpts(req) {
    return {};
  }
  deleteMany(req, res) {
    this.fireError(501, 'not_implemented');
  }

  getDeleteOneQuery(req) {
    return this.getItemQuery(req.params.id)
  }
  getDeleteOneOpts(req) {
    return {};
  }
  deleteOne(req, res) {
    this.collection().then(collection => {
      return collection.deleteOne(this.getDeleteOneQuery(req), this.getDeleteOneOpts(req)).then(result => {
        if (result.deletedCount != 1) {
          console.error('delete failed', result);
          this.fireError(404, 'not_found');
        } else {
          res.end();
        }
      });
    }).catch(err => {
      this.handleError(err, req, res);
    });
  }
}
