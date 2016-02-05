import { default as express } from 'express';
import { default as bodyParser } from 'body-parser';
import { register as jpdefine, create as jpcreate } from 'jsonpolice';
import { RESTError } from './error';

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

jpdefine('Route', {
  type: 'object',
  value: {
    method: {
      type: 'select',
      required: true,
      default: 'POST',
      value: [ 'GET', 'POST', 'PUT', 'DELETE', 'PATCH' ]
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
      validator: function(s) {
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
jpdefine('ResourceOptions', {
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

export class Resource {
  constructor(_options, _class) {
    this.options = jpcreate(_class || 'ResourceOptions', _options);
  }
  fireError(code, message, info, err) {
    throw new RESTError(code, message, info, err);
  }
  handleError(err, req, res, next) {
    if (err instanceof RESTError) {
      console.error('REST ERROR', err);
      err.send(res);
    } else if (err.name === 'DataError') {
      console.error('DATA ERROR', err);
      RESTError.send(res, 400, err.message, err.path);
    } else {
      console.error('GENERIC ERROR', err);
      RESTError.send(res, 500, 'internal');
    }
  }
  bodyContraintsMiddleWare(config) {
    return (req, res, next) => {
      req.body = jpcreate(config, req.body);
      next();
    }
  }
  queryContraintsMiddleWare(config) {
    console.log('query constraints', config);
    return (req, res, next) => {
      req.query = jpcreate(config, req.query);
      next();
    }
  }
  get router() {
    if (!this._router) {
      this._router = express.Router(this.options.router);
      for (var i = 0, r ; i < this.options.routes.length ; i++) {
        r = this.options.routes[i];
        var args = [ r.mount ];
        if (r.zone) {
          args.push(this['auth' + capitalize(r.zone)].bind(this));
        }
        if (r.body) {
          args.push(bodyParser.json());
          args.push(this.bodyContraintsMiddleWare(r.body));
        }
        if (r.query) {
          args.push(this.queryContraintsMiddleWare(r.query));
        }
        args.push(this[r.handler].bind(this));
        this._router[r.method.toLowerCase()].apply(this._router, args);
      }
      this._router.use(this.handleError.bind(this));
    }
    return this._router;
  }
  mount(app) {
    return app.use('/' + this.options.namePlural || this.options.name, this.router);
  }
}
