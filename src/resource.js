import fs from 'fs';
import _ from 'lodash';
import { default as log4js } from 'log4js';
import ejs from 'ejs';
import { deepExtend, Eredita } from 'eredita';

var logger = log4js.getLogger("arrest");

var _operationTemplates = {
  query: _getTemplate('query'),
  read: _getTemplate('read'),
  create: _getTemplate('create'),
  update: _getTemplate('update'),
  remove: _getTemplate('remove')
};

var scopesTemplate = _getTemplate('scopes');

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
  data.getSchema = function() {
    return JSON.stringify(data.schema);
  }
  data.getWriteSchema = function() {
    return JSON.stringify(data.schemaWrite || data.schema);
  }
  return ejs.compile(data, {});
}
function _mergeRoutes() {
  var args = Array.prototype.slice.call(arguments);
  var routes = {}, _routes, i, tmp;
  while (_routes = args.shift()) {
    for (i = 0, tmp = {} ; i < _routes.length ; i++) {
      tmp[_routes[i].handler] = _routes[i];
    }
    routes = deepExtend(routes, tmp);
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
    if (!this.namePlural) {
      this.namePlural = this.name + 's';
    }
    if (!this.scopes) {
      this.scopes = JSON.parse(scopesTemplate(this));
    }
    _.each(_.filter(api.securityDefinitions, { type: 'oauth2' }), i => {
      i.scopes = _.defaults(i.scopes || { }, this.scopes);
    });

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
      if (route.operation && route.merge && _operationTemplates[route.handler]) {
        var data = JSON.parse(_operationTemplates[route.handler](this));
        var op = new Eredita(route.operation, new Eredita(data));
        route.operation = op.mergePath();
      } else if (!route.operation && _operationTemplates[route.handler]) {
        route.operation = JSON.parse(_operationTemplates[route.handler](this));
      }
      if (route.operation) {
        var op = route.operation;
        op.tags = _.uniq((op.tags || []).concat([ this.name ]));
        if (!op['x-scopes'] && op.operationId) {
          op['x-scopes'] = [ op.operationId ];
        }
        if (op['x-scopes']) {
          op.security = [];
          _.each(api.securityDefinitions, function(i, k) {
            if (i.type === 'oauth2') {
              op.security.push({
                [k]: op['x-scopes']
              });
            }
          });
          delete op['x-scopes'];
        }
      }
      route.path = basePath + route.path;
      route.handler = this[route.handler].bind(this);
    });

    var tag = {
      "name": this.name,
      "description": this.description,
      "x-schema": this.schema
    };
    if (this.schemaWrite) {
      tag["x-schema-write"] = this.schemaWrite;
    }
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
    _.each(this.routes, function(route) {
      if (route.operation) {
        api.addOperation(route);
      }
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