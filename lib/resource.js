'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Resource = undefined;

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _jsonpolice = require('jsonpolice');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

(0, _jsonpolice.register)('Route', {
  type: 'object',
  value: {
    method: {
      type: 'select',
      required: true,
      default: 'POST',
      value: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    },
    mount: {
      type: 'string',
      required: true
    },
    handler: {
      type: 'string',
      required: true
    },
    zone: {
      type: 'string',
      validator: function validator(s) {
        // TODO implement the security zone check
        return true;
        //throw new Error('not_implemented');
      }
    },
    query: {
      type: 'object'
    },
    body: {
      type: 'object'
    }
  }
});
(0, _jsonpolice.register)('ResourceOptions', {
  type: 'object',
  value: {
    name: {
      type: 'string',
      required: true
    },
    namePlural: {
      type: 'string'
    },
    router: {
      type: 'object',
      required: true,
      default: {},
      value: {
        strict: {
          type: 'boolean',
          required: true,
          default: false
        },
        caseSensitive: {
          type: 'boolean',
          required: true,
          default: false
        },
        mergeParams: {
          type: 'boolean',
          required: true,
          default: false
        }
      }
    },
    routes: {
      type: 'array',
      required: true,
      value: 'Route',
      minLength: 1
    }
  }
});

var Resource = exports.Resource = function () {
  function Resource(_options, _class) {
    _classCallCheck(this, Resource);

    this.options = (0, _jsonpolice.create)(_class || 'ResourceOptions', _options);
  }

  _createClass(Resource, [{
    key: 'handleError',
    value: function handleError(e) {
      // TODO define a specific error class and send back secure and meaningful error messages
      res.send(e.status || 500, e.message);
    }
  }, {
    key: 'bodyContraintsMiddleWare',
    value: function bodyContraintsMiddleWare(config) {
      var _this = this;

      return function (req, res, next) {
        try {
          req.body = (0, _jsonpolice.create)(config, req.body);
          next();
        } catch (e) {
          // TODO send specific error
          _this.handleError(e);
        }
      };
    }
  }, {
    key: 'queryContraintsMiddleWare',
    value: function queryContraintsMiddleWare(_options) {
      var _this2 = this;

      return function (req, res, next) {
        try {
          req.query = (0, _jsonpolice.create)(config, req.query);
          next();
        } catch (e) {
          // TODO send specific error
          _this2.handleError(e);
        }
      };
    }
  }, {
    key: 'mount',
    value: function mount(app) {
      return app.use('/' + this.options.namePlural || this.options.name, this.router);
    }
  }, {
    key: 'router',
    get: function get() {
      if (!this._router) {
        this._router = _express2.default.Router(this.options.router);
        for (var i = 0, r; i < this.options.routes.length; i++) {
          r = this.options.routes[i];
          var args = [r.mount];
          if (r.zone) {
            args.push(this['auth' + capitalize(r.zone)].bind(this));
          }
          if (r.body) {
            args.push(_bodyParser2.default.json());
            args.push(this.bodyContraintsMiddleWare(r.body));
          }
          if (r.query) {
            args.push(this.queryContraintsMiddleWare(r.body));
          }
          args.push(this[r.handler].bind(this));
          this._router[r.method.toLowerCase()].apply(this._router, args);
        }
      }
      return this._router;
    }
  }]);

  return Resource;
}();

//# sourceMappingURL=resource.js.map