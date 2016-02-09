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
  itemQuery(id) {
    return {
      [ this.options.id ]: (this.options.idIsObjectId ? new ObjectId(id) : id)
    };
  }
  query(req, res) {
    this.collection().then(collection => {
      var opts = {};
      if (req.query.fields) {
        opts.fields = req.query.fields;
      }
      var cursor = collection.find({}, opts);
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
  read(req, res) {
    this.collection().then(collection => {
      var opts = {};
      if (req.query.fields) {
        opts.fields = req.query.fields;
      }
      return collection.find(this.itemQuery(req.params.id), opts).limit(1).next().then(data => {
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
  create(req, res) {
    console.log('create', req.body);
    this.collection().then(collection => {
      return collection.insertOne(req.body).then(result => {
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
  updateMany(req, res) {
    this.fireError(501, 'not_implemented');
  }
  updateOne(req, res) {
    this.collection().then(collection => {
      delete req.body[this.options.id];
      return collection.findOneAndUpdate(this.itemQuery(req.params.id), req.body, { returnOriginal: false }).then(result => {
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
  deleteMany(req, res) {
    this.fireError(501, 'not_implemented');
  }
  deleteOne(req, res) {
    this.collection().then(collection => {
      return collection.deleteOne(this.itemQuery(req.params.id)).then(result => {
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
