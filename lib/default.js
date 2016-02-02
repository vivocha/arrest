'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefaultResource = undefined;

var _resource = require('./resource');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var DefaultResource = exports.DefaultResource = function (_Resource) {
  _inherits(DefaultResource, _Resource);

  function DefaultResource(_options, _class) {
    _classCallCheck(this, DefaultResource);

    if (!_options.routes) {
      _options.routes = DefaultResource.defaultRoutes;
    }
    return _possibleConstructorReturn(this, Object.getPrototypeOf(DefaultResource).call(this, _options, _class));
  }

  _createClass(DefaultResource, [{
    key: 'query',
    value: function query(req, res) {
      res.send('query');
    }
  }, {
    key: 'read',
    value: function read(req, res) {
      console.log('hi');
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
  }, {
    key: 'authAdmin',
    value: function authAdmin(req, res, next) {
      console.log('admin!');
      next();
    }
  }]);

  return DefaultResource;
}(_resource.Resource);

DefaultResource.defaultRoutes = [{ method: 'GET', mount: '', handler: 'query' }, { method: 'GET', mount: '/:id', handler: 'read', zone: 'admin' }, { method: 'POST', mount: '', handler: 'create' }, { method: 'PUT', mount: '', handler: 'updateAll' }, { method: 'PUT', mount: '/:id', handler: 'updateOne' }, { method: 'DELETE', mount: '', handler: 'deleteAll' }, { method: 'DELETE', mount: '/:id', handler: 'deleteOne' }];

//# sourceMappingURL=default.js.map