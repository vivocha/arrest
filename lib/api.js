var _ = require('lodash')
  , log4js = require('log4js')
  , express = require('express')
  , bodyParser = require('body-parser')
  , semver = require('semver')
  , jr = require('jsonref')
  , jp = require('jsonpolice')
  , schema = require('./schema')
  , schemas = schema.schemas
  , RESTError = require('./error').RESTError
  , logger = log4js.getLogger("arrest");

var __path = Symbol();
var __handler = Symbol();

var _default = require('../data/defaults/swagger.json');
var toSwaggerPath = (function() {
  var _regexp = /\/:([^#\?\/]*)/g;
  return function (path) {
    return path.replace(_regexp, "/{$1}");
  }
})();
function _createValidators(p, key, parameters, middlewares, opts) {
  var validators = [];
  _.each(parameters, function(parameter) {
    var required = parameter.required;
    delete parameter.required;
    p = p.then(function() {
      return schema.create(parameter, opts);
    }).then(function(schema) {
      validators.push(function(obj) {
        if (typeof obj[key][parameter.name] === 'undefined' && required === true) {
          jp.fireValidationError(key + '.' + parameter.name, schema.scope, 'required');
        } else {
          var out = schema.validate(obj[key][parameter.name], key + '.' + parameter.name);
          if (typeof out !== 'undefined') {
            obj[key][parameter.name] = out;
          } else {
            delete obj[key][parameter.name];
          }
        }
      });
    });
  });
  return p.then(function() {
    middlewares.push(function(req, res, next) {
      _.each(validators, function(v) {
        v(req);
      });
      next();
    });
    return p;
  });
}

class API {
  constructor(info, opts) {
    schemas.info.validate(info);
    if (!semver.valid(info.version)) {
      throw new Error('invalid_version');
    }
    _.defaults(this, _default);
    this.info = info;
    var _opts = opts || {};
    _.each(_opts.auth, (a, n) => {
      if (!this.securityDefinitions) this.securityDefinitions = {};
      this.securityDefinitions[n] = a;
    });
  }
  addTag(tag) {
    if (!this.tags) this.tags = [];
    this.tags.push(tag);
  }
  addOperation(op) {
    op.operation[__path] = op.path;
    op.operation[__handler] = op.handler;
    var method = op.method.toLowerCase();
    var path = toSwaggerPath(op.path);
    if (!this.paths[path]) this.paths[path] = {};
    this.paths[path][method] = op.operation;
  }
  router(opts) {
    var r = express.Router();
    let knownPaths = new Set();
    var originalSwagger = JSON.parse(JSON.stringify(this));
    r.get('/swagger.json', (req, res) => {
      var out = _.cloneDeep(originalSwagger);
      out.host = req.headers.host || req.hostname;
      out.basePath = req.baseUrl || '/v' + semver.major(this.info.version);
      out.id = 'https://' + out.host + out.basePath + '/swagger.json#';
      _.each(originalSwagger.securityDefinitions, function(i, k) {
        if (i.authorizationUrl) {
          out.securityDefinitions[k].authorizationUrl = jr.normalizeUri(i.authorizationUrl, out.id, true);
        }
        if (i.tokenUrl) {
          out.securityDefinitions[k].tokenUrl = jr.normalizeUri(i.tokenUrl, out.id, true);
        }
      });
      res.json(out);
    });
    return schema.resolve(this, opts).then(() => {
      var p = Promise.resolve(true);
      _.each(this.paths, path => {
        _.each(path, (op, method) => {
          knownPaths.add(op[__path]);
          var args = [ op[__path] ];
          if (op.security) {
            p = p.then(() => {
              args.push(this.securityValidator(op.security));
            });
          }
          var params = _.groupBy(op.parameters, 'in');
          if (params.header) {
            p = _createValidators(p, 'headers', params.security, args, opts);
          }
          if (params.path) {
            _.each(params.path, function(i) {
              i.required = true;
            });
            p = _createValidators(p, 'params', params.path, args, opts);
          }
          if (params.query) {
            p = _createValidators(p, 'query', params.query, args, opts);
          }
          if (params.body) {
            p = p.then(function() {
              return schema.create(params.body[0].schema, opts);
            }).then(function(schema) {
              args.push(bodyParser.json());
              args.push(function(req, res, next) {
                if (typeof req.body === 'undefined') {
                  if (params.body[0].required === true) {
                    jp.fireValidationError('body', schema.scope, 'required');
                  }
                } else {
                  schema.validate(req.body, 'body');
                }
                next();
              });
            });
          }
          p = p.then(function() {
            args.push(op[__handler]);
            r[method].apply(r, args);
          });
        });
      });
      return p;
    }).then(function() {  
      knownPaths.forEach(path => {
        r.all(path, API.handleMethodNotAllowed);
      });  
      r.use(API.handleError);
      return r;
    });
  }
  attach(base) {
    return this.router().then(router => {
      base.use('/v' + semver.major(this.info.version), router);
      return base;
    });
  }
  securityValidator(security) {
    return function(req, res, next) {
      logger.warn('using default security validator');
      next();
    }
  }
  static handleMethodNotAllowed(req, res, next){    
    next(API.newError(405, 'Method Not Allowed', "The API Endpoint doesn't support the specified HTTP method for the given resource", new Error('MethodNotAllowed')));
  }
  static newError(code, message, info, err) {
    return new RESTError(code, message, info, err);
  }
  static fireError(code, message, info, err) {
    throw new RESTError(code, message, info, err);
  }
  static handleError(err, req, res, next) {
    if (err.name === 'RESTError') {
      logger.error('REST ERROR', err);
      RESTError.send(res, err.code || 500, err.message, err.info);
    } else if (err.name === 'ValidationError') {
      logger.error('DATA ERROR', err);
      RESTError.send(res, 400, err.message, err.path);    
    } else if (err.name === 'MethodNotAllowed') {
      logger.error('METHOD NOT ALLOWED ERROR', err);
      RESTError.send(res, 405, err.message, err.path);    
    } else {
      logger.error('GENERIC ERROR', err, err.stack);
      RESTError.send(res, 500, 'internal');
    }    
  }
 
  
}

module.exports.API = API;