import { default as _ } from 'underscore';
import { register as jpdefine } from 'jsonpolice';
import { Resource } from './resource'

jpdefine('DefaultQueryArgs', {
  type: 'object',
  loose: true,
  value: {
    limit: {
      type: 'number',
      min: 1,
      max: 100,
      default: 20
    },
    skip: {
      type: 'number',
      min: 0,
      default: 0
    },
    fields: {
      type: 'object',
      transform: function(v) {
        console.log('transform in', v);
        if (typeof v !== 'undefined') {
          if (typeof v === 'string') {
            v = v.split(',');
          }
          if (typeof v === 'object') {
            if (v instanceof Array) {
              v = _.reduce(v, function(out, val) {
                if (val[0] === '-') {
                  out[val.substr(1)] = false;
                } else {
                  out[val] = true;
                }
                return out;
              }, {});
            }
            // Normalize to actual boolean values
            v = _.reduce(v, function(out, val, key) {
              out[key] = !!val;
              return out;
            }, {});
          }
        }
        console.log('transform out', v);
        return v;
      }
    }
  }
});
jpdefine('DefaultReadArgs', {
  type: 'object',
  loose: true,
  value: {
    fields: {
      type: 'array',
      value: {
        type: 'string'
      }
    }
  }
});
jpdefine('DefaultBody', {
  type: 'object',
  required: true
});
jpdefine('DefaultBodyArray', {
  type: 'array',
  required: true,
  minLength: 1,
  value: 'DefaultBody'
});

export class RESTResource extends Resource {
  constructor(_options, _class) {
    if (_options.routes) {
      if (_options.mergeRoutes) {
        _options.routes = RESTResource.mergeRoutes(RESTResource.defaultRoutes, _options.routes);
      }
    } else {
      _options.routes = RESTResource.defaultRoutes;
    }
    super(_options, _class);
  }
  query(req, res) {
    this.fireError(501, 'not_implemented');
  }
  read(req, res) {
    this.fireError(501, 'not_implemented');
  }
  create(req, res) {
    this.fireError(501, 'not_implemented');
  }
  updateMany(req, res) {
    this.fireError(501, 'not_implemented');
  }
  updateOne(req, res) {
    this.fireError(501, 'not_implemented');
  }
  deleteMany(req, res) {
    this.fireError(501, 'not_implemented');
  }
  deleteOne(req, res) {
    this.fireError(501, 'not_implemented');
  }
  static mergeRoutes() {
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
  static getFullURL(req) {
    return (req.proto || 'http') + '://' + (req.headers.host || req.hostname) + (req.baseUrl || '/') + req.path;
  }
  static toQueryString(obj) {
    return _.map(obj, function(v, k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }).join('&');
  }
}
RESTResource.defaultRoutes = [
  { method: 'GET',    mount: '',     handler: 'query',      query: 'DefaultQueryArgs' },
  { method: 'GET',    mount: '/:id', handler: 'read',       query: 'DefaultReadArgs' },
  { method: 'POST',   mount: '',     handler: 'create',     body:  'DefaultBody' },
  { method: 'PUT',    mount: '',     handler: 'updateMany', body:  'DefaultBodyArray' },
  { method: 'PUT',    mount: '/:id', handler: 'updateOne',  body:  'DefaultBody' },
  { method: 'DELETE', mount: '',     handler: 'deleteMany' },
  { method: 'DELETE', mount: '/:id', handler: 'deleteOne' }
];
