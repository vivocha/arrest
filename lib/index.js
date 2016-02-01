'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Resource = undefined;

var _resource = require('./resource.js');

Object.defineProperty(exports, 'Resource', {
  enumerable: true,
  get: function get() {
    return _resource.Resource;
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