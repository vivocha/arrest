import { API } from '../../dist/api';
import { Operation } from '../../dist/operation';
import { Resource } from '../../dist/resource';

/*
 * Simple TEST API instances
 */

class Op1 extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'op1');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema2' }
        }
      },
      required: true
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string'
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        }
      },
      properties: {
        a: {
          type: 'boolean'
        },
        b: {
          type: 'integer'
        }
      },
      additionalProperties: false,
      required: ['a']
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          type: 'string'
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' }
      },
      additionalProperties: false,
      required: ['d']
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI: API = new API();
simpleAPI.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));

// Another test API
class AnOperation extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'anOperation');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema1' }
        }
      },
      required: true
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string'
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        }
      },
      properties: {
        a: {
          type: 'boolean'
        },
        b: {
          type: 'integer'
        }
      },
      additionalProperties: false,
      required: ['a']
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defC'
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' }
      },
      additionalProperties: false,
      required: ['d']
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI2: API = new API();
simpleAPI2.addResource(new Resource({ name: 'thing' }, { '/a': { post: AnOperation } }));

// Another test API with custom info and crossed references
class AnOperation2 extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'anOperation');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema2' }
        }
      },
      required: true
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string'
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        }
      },
      properties: {
        a: {
          type: 'boolean'
        },
        b: {
          type: 'integer'
        }
      },
      additionalProperties: false,
      required: ['a']
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defC'
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' }
      },
      additionalProperties: false,
      required: ['d']
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI3: API = new API({ title: 'simpleAPI3', version: '1.1.1', contact: { email: 'me@test.org' } });
simpleAPI3.addResource(new Resource({ name: 'thing' }, { '/foo': { post: AnOperation2 } }));

// test API with refs to aSchema/definitions/aDef/definitions/settings
class TestOperation extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'anOperation');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema2' }
        }
      },
      required: true
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string',
          definitions: {
            settings: {
              type: 'object'
            }
          }
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        }
      },
      properties: {
        a: {
          type: 'boolean'
        },
        b: {
          type: 'integer'
        }
      },
      additionalProperties: false,
      required: ['a']
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defA/definitions/settings'
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' }
      },
      additionalProperties: false,
      required: ['d']
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI4: API = new API({ title: 'simpleAPI4', version: '1.1.1', contact: { email: 'me@test.org' } });
simpleAPI4.addResource(new Resource({ name: 'thing' }, { '/foo': { post: TestOperation } }));

// test API with a reference to a schema that doesn't exist
class Operation5 extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'anOperation');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema2' }
        }
      },
      required: true
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string',
          definitions: {
            settings: {
              type: 'object'
            }
          }
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' }
          }
        }
      },
      properties: {
        a: {
          type: 'boolean'
        },
        b: {
          type: 'integer'
        }
      },
      additionalProperties: false,
      required: ['a']
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defA/definitions/ghost_schema'
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' }
      },
      additionalProperties: false,
      required: ['d']
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI5: API = new API({ title: 'simpleAPI5', version: '1.1.1', contact: { email: 'me@test.org' } });
simpleAPI5.addResource(new Resource({ name: 'thing' }, { '/foo': { post: Operation5 } }));
// exports
export { simpleAPI, simpleAPI2, simpleAPI3, simpleAPI4, simpleAPI5 };
