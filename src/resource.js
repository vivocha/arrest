import { default as express } from 'express';
import { default as bodyParser } from 'body-parser';
import { register as jpdefine, create as jpcreate } from 'jsonpolice';

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/*
 { method: 'get',    mount: '',     handler: this._query },
 { method: 'get',    mount: '/:id', handler: this._get },
 { method: 'put',    mount: '',     handler: this._create },
 { method: 'post',   mount: '',     handler: this._create },
 { method: 'post',   mount: '/:id', handler: this._update },
 { method: 'delete', mount: '/:id', handler: this._remove }
*/


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
        throw new Error('not_implemented');
      }
    }
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
  constructor(_options) {
    this.options = jpcreate('ResourceOptions', _options);
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
  router() {
    if (!this.router) {
      this.router = express.Router(this.options.router);
      for (var i = 0, r ; i < this.routes.length ; i++) {
        r = this.routes[i];
        var args = [];
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
        this.router[r.method.toLowerCase()].apply(this.router, args);
      }
    }
    return this.router;
  }
  mount(app) {
    return app.use('/' + this.options.namePlural || this.options.name, this.router());
  }
}
