'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Resource = undefined;

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _jsonpolice = require('jsonpolice');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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

    operations: {
      type: 'object',
      required: true,
      default: {},
      value: {
        query: {
          type: 'boolean',
          default: true
        },
        create: {
          type: 'boolean',
          default: true
        },
        read: {
          type: 'boolean',
          default: true
        },
        updateOne: {
          type: 'boolean',
          default: true
        },
        updateMany: {
          type: 'boolean',
          default: false
        },
        deleteOne: {
          type: 'boolean',
          default: true
        },
        deleteMany: {
          type: 'boolean',
          default: false
        }
      }
    },
    actions: {
      type: 'array',
      value: {
        type: 'object',
        value: {
          name: {
            type: 'string',
            required: true
          },
          method: {
            type: 'select',
            required: true,
            default: 'POST',
            value: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
          },
          collection: {
            type: 'boolean',
            default: false
          }
        }
      }
    }
  }
});

var Resource = exports.Resource = function () {
  function Resource(_options) {
    _classCallCheck(this, Resource);

    this.options = (0, _jsonpolice.create)('ResourceOptions', _options);
  }

  _createClass(Resource, [{
    key: 'router',
    value: function router() {
      this.router = _express2.default.Router(this.options.router);
      if (this.options.operations.query) this.router.get('/', this.query.bind(this));
      if (this.options.operations.create) this.router.post('/', this.create.bind(this));
      if (this.options.operations.read) this.router.get('/:id', this.read.bind(this));
      if (this.options.operations.updateOne) this.router.put('/:id', this.updateOne.bind(this));
      if (this.options.operations.updateMany) this.router.put('/', this.updateMany.bind(this));
      if (this.options.operations.deleteOne) this.router.delete('/:id', this.deleteOne.bind(this));
      if (this.options.operations.deleteMany) this.router.delete('/', this.deleteMany.bind(this));
      return this.router;
    }
  }, {
    key: 'mount',
    value: function mount(app) {
      return app.use('/' + this.options.namePlural || this.options.name, this.router());
    }
  }, {
    key: 'query',
    value: function query(req, res) {
      res.end('query');
    }
  }, {
    key: 'create',
    value: function create(req, res) {
      res.end('create');
    }
  }, {
    key: 'read',
    value: function read(req, res) {
      res.end('read');
    }
  }, {
    key: 'updateOne',
    value: function updateOne(req, res) {
      res.end('updateOne');
    }
  }, {
    key: 'updateMany',
    value: function updateMany(req, res) {
      res.end('updateMany');
    }
  }, {
    key: 'deleteOne',
    value: function deleteOne(req, res) {
      res.end('deleteOne');
    }
  }, {
    key: 'deleteMany',
    value: function deleteMany(req, res) {
      res.end('deleteMany');
    }
  }]);

  return Resource;
}();

//# sourceMappingURL=resource.js.map