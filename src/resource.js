import fs from 'fs';
import _ from 'lodash';
import ejs from 'ejs';
import * as schema from './schema';

var _operationTemplates = {
  query: _getTemplate('query'),
  read: _getTemplate('read'),
  create: _getTemplate('create'),
  update: _getTemplate('update'),
  remove: _getTemplate('remove'),
  //updateMany: _getTemplate('updateMany'),
  //removeMany: _getTemplate('removeMany')
};

var _defaultRoutes = [
  { method: 'GET',    path: '',     handler: 'query' },
  { method: 'GET',    path: '/:id', handler: 'read' },
  { method: 'POST',   path: '',     handler: 'create' },
  { method: 'PUT',    path: '/:id', handler: 'update' },
  { method: 'DELETE', path: '/:id', handler: 'remove' },
  { method: 'PUT',    path: '',     handler: 'updateMany' },
  { method: 'DELETE', path: '',     handler: 'removeMany' }
];

function _getTemplate(name) {
  var data = fs.readFileSync(__dirname + '/../data/defaults/' + name + '.json', 'ascii');
  return ejs.compile(data, {});
}
function _mergeRoutes() {
  var args = Array.prototype.slice.call(arguments);
  var routes = {}, _routes, i, tmp;
  while (_routes = args.shift()) {
    for (i = 0, tmp = {} ; i < _routes.length ; i++) {
      tmp[_routes[i].handler] = _routes[i];
    }
    routes = extend(routes, tmp);
  }
  var out = [];
  for (i in routes) {
    out.push(routes[i]);
  }
  return out;
}

export class Resource {
  constructor(api, resource) {
    _.defaults(this, resource);
    if (!this.routes) {
      this.routes = _.cloneDeep(_defaultRoutes);
    }
    if (this.additionalRoutes) {
      this.routes = _mergeRoutes(this.routes, this.additionalRoutes);
      delete this.additionalRoutes;
    }
    this.routes = _.filter(this.routes, route => { return typeof this[route.handler] === 'function'; });
    var basePath = '/' + Resource.uncapitalize(this.namePlural);
    _.each(this.routes, route => {
      if (!route.operation && _operationTemplates[route.handler]) {
        var data = _operationTemplates[route.handler](this);
        route.operation = JSON.parse(data);
      }
      if (route.operation) {
        route.operation.tags = _.uniq((route.operation.tags || []).concat([ this.name, route.handler ]));
      }
      route.path = basePath + route.path;
      route.handler = this[route.handler].bind(this);
    });

    var tag = {
      name: this.name,
      description: this.description
    };
    if (this.externalDocs) tag.externalDocs = this.externalDocs;
    api.addTag(tag);

    if (this.definitions) {
      for (var i in this.definitions) {
        api.definitions[i] = this.definitions[i];
      }
    }
    if (this.parameters) {
      for (var i in this.parameters) {
        api.parameters[i] = this.parameters[i];
      }
    }
    if (this.schema) {
      api.definitions[this.name] = this.schema;
    }

    _.each(this.routes, function(route) {
      api.addOperation(route);
    });
  }
  static uncapitalize(s) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
  static capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  static getFullURL(req) {
    return (req.proto || 'http') + '://' + (req.headers.host || req.hostname) + (req.baseUrl || '/') + req.path;
  }
  static toQueryString(obj) {
    return _.map(obj, function(v, k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }).join('&');
  }
}