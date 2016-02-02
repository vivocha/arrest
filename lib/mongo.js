'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MongoResource = undefined;

var _default = require('./default');

var _jsonpolice = require('jsonpolice');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

(0, _jsonpolice.register)('MongoResourceOptions', {
  value: {
    db: {
      type: 'string',
      required: true
    },
    collection: {
      type: 'string',
      required: true
    }
  }
}, 'ResourceOptions');

var MongoResource = exports.MongoResource = function (_DefaultResource) {
  _inherits(MongoResource, _DefaultResource);

  function MongoResource(_options) {
    _classCallCheck(this, MongoResource);

    return _possibleConstructorReturn(this, Object.getPrototypeOf(MongoResource).call(this, _options, 'MongoResourceOptions'));
  }

  _createClass(MongoResource, [{
    key: 'query',
    value: function query(req, res) {
      res.send('query');
    }
  }, {
    key: 'read',
    value: function read(req, res) {
      console.log('mongo hi!');
      res.send('get ' + req.params.id);
    }
  }, {
    key: 'create',
    value: function create(req, res) {
      res.send('create');
    }
  }, {
    key: 'updateAll',
    value: function updateAll(req, res) {
      res.send('updateAll');
    }
  }, {
    key: 'updateOne',
    value: function updateOne(req, res) {
      res.send('updateOne');
    }
  }, {
    key: 'deleteAll',
    value: function deleteAll(req, res) {
      res.send('deleteAll');
    }
  }, {
    key: 'deleteOne',
    value: function deleteOne(req, res) {
      res.send('query');
    }
  }]);

  return MongoResource;
}(_default.DefaultResource);

//# sourceMappingURL=mongo.js.map