import _ from 'lodash';
import { default as express } from 'express';
import { default as bodyParser } from 'body-parser';
import { default as semver } from 'semver';
import { fireValidationError } from 'jsonpolice';
import { schemas, create as createSchema, resolve as resolveRefs } from './schema';
import { RESTError } from './error';

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
      return createSchema(parameter, opts);
    }).then(function(schema) {
      validators.push(function(obj) {
        if (typeof obj[key][parameter.name] === 'undefined' && required === true) {
          fireValidationError(key + '.' + parameter.name, schema.scope, 'required');
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

export class API {
  constructor(info) {
    schemas.info.validate(info);
    if (!semver.valid(info.version)) {
      throw new Error('invalid_version');
    }
    _.defaults(this, _default);
    this.info = info;
  }
  addTag(tag) {
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
    var originalSwagger = JSON.parse(JSON.stringify(this));
    r.get('/swagger.json', (req, res) => {
      var out = _.clone(originalSwagger);
      out.host = req.headers.host || req.hostname;
      out.basePath = req.baseUrl || '/v' + semver.major(this.info.version);
      res.json(out);
    });
    return resolveRefs(this, opts).then(() => {
      var p = Promise.resolve(true);
      _.each(this.paths, path => {
        _.each(path, (op, method) => {
          var args = [ op[__path] ];
          if (op.security) {
            p = p.then(function() {
              args.push(API.securityValidator(params.security));
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
              return createSchema(params.body[0].schema, opts);
            }).then(function(schema) {
              args.push(bodyParser.json());
              args.push(function(req, res, next) {
                if (typeof req.body === 'undefined') {
                  if (params.body[0].required === true) {
                    fireValidationError('body', schema.scope, 'required');
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
  static newError(code, message, info, err) {
    return new RESTError(code, message, info, err);
  }
  static fireError(code, message, info, err) {
    throw new RESTError(code, message, info, err);
  }
  static handleError(err, req, res, next) {
    if (err.name === 'RESTError') {
      console.error('REST ERROR', err);
      RESTError.send(res, err.code || 500, err.message, err.info);
    } else if (err.name === 'ValidationError') {
      console.error('DATA ERROR', err);
      RESTError.send(res, 400, err.message, err.path);
    } else {
      console.error('GENERIC ERROR', err, err.stack);
      RESTError.send(res, 500, 'internal');
    }
  }
  static securityValidator(security) {
    return function(req, res, next) {
      // TODO implement the security validator
      next();
    }
  }
}
