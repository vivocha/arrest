import { default as express } from 'express';
import { default as bodyParser } from 'body-parser';
import { register as jpdefine, create as jpcreate } from 'jsonpolice';

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
  handleError(e) {
    // TODO define a specific error class and send back secure and meaningful error messages
    res.send(e.status || 500, e.message);
  }
  bodyContraintsMiddleWare(config) {
    return (req, res, next) => {
      try {
        req.body = jpcreate(config, req.body);
        next();
      } catch(e) {
        // TODO send specific error
        this.handleError(e);
      }
    }
  }
  queryContraintsMiddleWare(_options) {
    return (req, res, next) => {
      try {
        req.query = jpcreate(config, req.query);
        next();
      } catch(e) {
        // TODO send specific error
        this.handleError(e);
      }
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
          args.push(this.queryContraintsMiddleWare(r.body));
        }
        args.push(this[r.handler].bind(this));
        this._router[r.method.toLowerCase()].apply(this._router, args);
      }
    }
    return this._router;
  }
  mount(app) {
    return app.use('/' + this.options.namePlural || this.options.name, this.router);
  }
}
