'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MongoResource = exports.DefaultResource = exports.Resource = undefined;

var _resource = require('./resource.js');

Object.defineProperty(exports, 'Resource', {
  enumerable: true,
  get: function get() {
    return _resource.Resource;
  }
});

var _default = require('./default.js');

Object.defineProperty(exports, 'DefaultResource', {
  enumerable: true,
  get: function get() {
    return _default.DefaultResource;
  }
});

var _mongo = require('./mongo.js');

Object.defineProperty(exports, 'MongoResource', {
  enumerable: true,
  get: function get() {
    return _mongo.MongoResource;
  }
});
exports.create = create;
exports.mount = mount;
function create(options) {
  return new _resource.Resource(options);
}
function mount(app, options) {
  new _resource.Resource(options).mount(app);
}

//# sourceMappingURL=index.js.map