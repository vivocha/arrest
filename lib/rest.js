var util = require('util')
  , EventEmitter = require('events').EventEmitter
  , MongoClient = require('mongodb').MongoClient
  , ObjectID = require('mongodb').ObjectID

function RestAPI() {
  this.routes = [
    { method: 'get',    mount: '',     handler: this._query },
    { method: 'get',    mount: '/:id', handler: this._get },
    { method: 'put',    mount: '',     handler: this._create },
    { method: 'post',   mount: '',     handler: this._create },
    { method: 'post',   mount: '/:id', handler: this._update },
    { method: 'delete', mount: '/:id', handler: this._remove }
  ];
}
util.inherits(RestAPI, EventEmitter);
RestAPI.prototype.getRoutes = function() {
  return this.routes;
}

RestAPI.prototype._query = function(req, res) {
  this.query(exports.responseCallback(res));  
}
RestAPI.prototype._get = function(req, res) {
  if (!req.params.id) {
    exports.sendError(res, 400, 'id missing');
  } else {
    this.get({ _id: ObjectID(req.params.id) }, exports.responseCallback(res));  
  }
}
RestAPI.prototype._create = function(req, res) {
  if (!req.body) {
    exports.sendError(res, 400, 'body missing');
  } else {
    this.create(req.body, exports.responseCallback(res));  
  }
}
RestAPI.prototype._update = function(req, res) {
  if (!req.params.id) {
    exports.sendError(res, 400, 'id missing');
  } else if (!req.body) {
    exports.sendError(res, 400, 'body missing');
  } else {
    this.update({ _id: ObjectID(req.params.id) }, req.body, exports.responseCallback(res));  
  }
}
RestAPI.prototype._remove = function(req, res) {
  if (!req.params.id) {
    exports.sendError(res, 400, 'id missing');
  } else {
    this.remove({ _id: ObjectID(req.params.id) }, exports.responseCallback(res));  
  }
}

function RestMongoAPI(uri, collection) {
  RestAPI.call(this);
  
  if (uri.collection) {
    this.db = uri;
  } else {
    var self = this;
    MongoClient.connect(uri, { auto_reconnect: true }, function(err, db) {
      if (err) return self.emit('error', err);
      self.db = db;
      self.emit('connect', db);
      db.on('error', function(err) {
        self.emit('error', err);
      });
    });
  }  
  this.collection = collection;
}
util.inherits(RestMongoAPI, RestAPI);
RestMongoAPI.prototype._return = function(err, data, isArray, cb) {
  if (!cb) {
    return;
  } else if (err) {
    cb(500, err.message ? err.message : err);
  } else if (!data) {
    cb(404);
  } else if (isArray) {
    cb(null, data);
  } else {
    cb(null, util.isArray(data) ? data[0] : data);
  }
}
RestMongoAPI.prototype.query = function(criteria, options, cb) {
  if (typeof criteria === 'function') {
    cb = criteria;
    criteria = {};
    options = {};
  } else if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  
  var self = this;
  
  if (!options.limit) options.limit = 100;
    
  self.db.collection(self.collection).find(criteria, options).toArray(function(err, data) {
    self._return(err, data, true, cb);
  });
}
RestMongoAPI.prototype.get = function(criteria, cb) {
  var self = this;
  self.db.collection(self.collection).findOne(criteria, function(err, data) {
    self._return(err, data, false, cb);
  });
}
RestMongoAPI.prototype.create = function(data, cb) {
  var self = this;
  self.db.collection(self.collection).insert(data, function(err, data) {
    self._return(err, data, false, cb);
  });
}
RestMongoAPI.prototype.update = function(criteria, data, cb) {
  delete data._id;
  var self = this;
  self.db.collection(self.collection).update(criteria, data, function(err, _data) {
    if (criteria._id) {
      data._id = criteria._id.toString();
    }
    self._return(err, _data ? data : null, false, cb);
  });
}
RestMongoAPI.prototype.remove = function(criteria, cb) {
  var self = this;
  self.db.collection(self.collection).remove(criteria, function(err, data) {
    if (err) {
      cb(500, err.message ? err.message : err);
    } else if (!data) {
      cb(400);
    } else {
      cb(null, '');
    }
  });
}

exports.use = function(express, mount, api) {
  var routes = api.getRoutes();
  function getHandler(context, f) {
    return function(req, res) {
      f.call(context, req, res);
    }
  }
  
  for (var i = 0 ; i < routes.length ; i++) {
    express[routes[i].method](mount + routes[i].mount, getHandler(api, routes[i].handler));
  }
}
exports.throwError = function(code, message) {
  console.error(code, message);
  var err = new Error(message);
  err.code = code;
  throw err;
}
exports.sendError = function(res, code, message) {
  var data = { success: false };
  if (message) data.error = message;
  res.jsonp(code, data);
}
exports.responseCallback = function(res) {
  var self = this;
  return function(err, data) {
    if (err) {
      self.sendError(res, err.code || 400, err.message);
    } else {
      res.jsonp(data);
    }
  }
}
exports.RestAPI = RestAPI;
exports.RestMongoAPI = RestMongoAPI;

