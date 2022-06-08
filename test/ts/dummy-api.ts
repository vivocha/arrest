import { API } from '../../dist/api.js';
import { Operation } from '../../dist/operation.js';
import { Resource } from '../../dist/resource.js';
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
          schema: { $ref: '#/components/schemas/op1_schema2' },
        },
      },
      required: true,
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string',
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
      },
      properties: {
        a: {
          type: 'boolean',
        },
        b: {
          type: 'integer',
        },
      },
      additionalProperties: false,
      required: ['a'],
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          type: 'string',
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' },
      },
      additionalProperties: false,
      required: ['d'],
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI: API = new API();
simpleAPI.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));

// Another simple test API
class AnOperation extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'anOperation');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema1' },
        },
      },
      required: true,
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string',
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
      },
      properties: {
        a: {
          type: 'boolean',
        },
        b: {
          type: 'integer',
        },
      },
      additionalProperties: false,
      required: ['a'],
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defC',
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' },
      },
      additionalProperties: false,
      required: ['d'],
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI2: API = new API();
simpleAPI2.addResource(new Resource({ name: 'thing' }, { '/a': { post: AnOperation } }));

// Test API with custom info and crossed references
class AnOperation2 extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'anOperation');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema2' },
        },
      },
      required: true,
    };
  }
  attach(api) {
    api.registerSchema('op1_schema1', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      definitions: {
        defA: {
          type: 'string',
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
      },
      properties: {
        a: {
          type: 'boolean',
        },
        b: {
          type: 'integer',
        },
      },
      additionalProperties: false,
      required: ['a'],
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defC',
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' },
      },
      additionalProperties: false,
      required: ['d'],
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI3: API = new API({ title: 'simpleAPI3', version: '1.1.1', contact: { email: 'me@test.org' } });
simpleAPI3.addResource(new Resource({ name: 'thing' }, { '/foo': { post: AnOperation2 } }));

// test API with refs like aSchema/definitions/aDef/definitions/settings
class TestOperation extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'anOperation');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/op1_schema2' },
        },
      },
      required: true,
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
              type: 'object',
            },
          },
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
      },
      properties: {
        a: {
          type: 'boolean',
        },
        b: {
          type: 'integer',
        },
      },
      additionalProperties: false,
      required: ['a'],
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defA/definitions/settings',
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' },
      },
      additionalProperties: false,
      required: ['d'],
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
          schema: { $ref: '#/components/schemas/op1_schema2' },
        },
      },
      required: true,
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
              type: 'object',
            },
          },
        },
        defB: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
        defC: {
          type: 'object',
          properties: {
            propA: { $ref: '#/definitions/defA' },
          },
        },
      },
      properties: {
        a: {
          type: 'boolean',
        },
        b: {
          type: 'integer',
        },
      },
      additionalProperties: false,
      required: ['a'],
    });
    api.registerSchema('op1_schema2', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        c: {
          $ref: 'op1_schema1#/definitions/defA/definitions/ghost_schema',
        },
        d: { $ref: 'op1_schema1' },
        e: { $ref: 'op1_schema1#/properties/b' },
      },
      additionalProperties: false,
      required: ['d'],
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const simpleAPI5: API = new API({ title: 'simpleAPI5', version: '1.1.1', contact: { email: 'me@test.org' } });
simpleAPI5.addResource(new Resource({ name: 'thing' }, { '/foo': { post: Operation5 } }));

// Test API with crossed complex refs
const thingSchema = {
  type: 'object',
  definitions: {
    info: {
      type: 'object',
      definitions: {
        settings: {
          type: 'object',
        },
        name: {
          $ref: 'common#/definitions/notEmptyString',
        },
      },
    },
    model: {
      type: 'object',
      properties: {
        name: { $ref: 'thing#/definitions/info/definitions/name' },
        code: { type: 'integer' },
      },
    },
    notes: {
      type: 'object',
      properties: {
        text: { $ref: 'common#/definitions/notEmptyString' },
      },
    },
  },
  properties: {
    id: {
      type: 'integer',
      readOnly: true,
    },
    info: {
      $ref: '#/definitions/info',
    },
    model: {
      $ref: '#/definitions/model',
    },
    notes: {
      $ref: '#/definitions/notes',
    },
  },
  additionalProperties: false,
  required: ['model'],
};
const commonSchema = {
  type: 'object',
  definitions: {
    notEmptyString: {
      type: 'string',
      minLength: 1,
    },
  },
};
class CreateThingOperation extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'createThing');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/thing' },
        },
      },
      required: true,
    };
    this.info.responses = {
      '200': {
        description: 'result...',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/result' },
          },
        },
      },
    };
  }
  attach(api) {
    api.registerSchema('result', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        message: 'common#/definitions/notEmptyString',
        thing: {
          $ref: 'thing',
        },
      },
      additionalProperties: false,
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
class GetThingsOperation extends Operation {
  constructor(resource, path, method) {
    super(resource, path, method, 'getThings');
    this.info.responses = {
      '200': {
        description: ' a list of things',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/thing' },
            },
          },
        },
      },
    };
  }
  attach(api) {
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body });
  }
}
const simpleAPI6: API = new API({ title: 'simpleAPI6', version: '2.2.22', contact: { email: 'me@test.org' } });
simpleAPI6.registerSchema('common', commonSchema as any);
simpleAPI6.registerSchema('thing', thingSchema as any);
simpleAPI6.addResource(new Resource({ name: 'thing' }, { '/': { post: CreateThingOperation, get: GetThingsOperation } }));

// Test API with crossed complex refs
const thingSchema2 = {
  type: 'object',
  definitions: {
    info: {
      type: 'object',
      definitions: {
        settings: {
          type: 'object',
        },
        name: {
          $ref: 'common#/definitions/notEmptyString',
        },
      },
    },
    model: {
      type: 'object',
      properties: {
        name: { $ref: 'thing#/definitions/info/definitions/name' },
        code: { type: 'integer' },
        notes: { $ref: '#/definitions/notes' },
        models: { type: 'array', items: { $ref: '#/definitions/model' } },
      },
    },
    notes: {
      type: 'object',
      properties: {
        model: { $ref: '#/definitions/model' },
      },
    },
    loop: {
      type: 'object',
      definitions: {
        info: {
          type: 'object',
          definitions: {
            settings: {
              type: 'object',
            },
            name: {
              $ref: 'common#/definitions/notEmptyString',
            },
          },
        },
        model: {
          type: 'object',
          properties: {
            name: { $ref: 'thing#/definitions/info/definitions/name' },
            code: { type: 'integer' },
            notes: { $ref: '#/definitions/notes' },
            models: { type: 'array', items: { $ref: '#/definitions/model' } },
          },
        },
        notes: {
          type: 'object',
          properties: {
            model: { $ref: '#/definitions/model' },
          },
        },
      },
      properties: {
        id: {
          type: 'integer',
          readOnly: true,
        },
        info: {
          $ref: '#/definitions/info',
        },
        model: {
          $ref: '#/definitions/model',
        },
        notes: {
          $ref: '#/definitions/notes',
        },
      },
      additionalProperties: false,
      required: ['model'],
    },
  },
  properties: {
    id: {
      type: 'integer',
      readOnly: true,
    },
    info: {
      $ref: '#/definitions/info',
    },
    model: {
      $ref: '#/definitions/model',
    },
    notes: {
      $ref: '#/definitions/notes',
    },
    other: { $ref: 'thing#/properties/notes' },
  },
  additionalProperties: true,
  required: ['model'],
};
const commonSchema2 = {
  type: 'object',
  definitions: {
    notEmptyString: {
      type: 'string',
      minLength: 1,
    },
  },
};
class CreateThing2Operation extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, 'createThing');
    this.info.requestBody = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/thing' },
        },
      },
      required: true,
    };
    this.info.responses = {
      '200': {
        description: 'result...',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/result' },
          },
        },
      },
    };
  }
  attach(api) {
    api.registerSchema('result', {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      properties: {
        message: 'common#/definitions/notEmptyString',
        thing: {
          $ref: 'thing',
        },
      },
      additionalProperties: false,
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
class GetThings2Operation extends Operation {
  constructor(resource, path, method) {
    super(resource, path, method, 'getThings');
    this.info.responses = {
      '200': {
        description: ' a list of things',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/thing' },
            },
          },
        },
      },
    };
  }
  attach(api) {
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body });
  }
}
const simpleAPI7: API = new API({ title: 'simpleAPI7', version: '2.2.22', contact: { email: 'me@test.org' } });
simpleAPI7.registerSchema('common', commonSchema2 as any);
simpleAPI7.registerSchema('thing', thingSchema2 as any);
simpleAPI7.addResource(new Resource({ name: 'thing' }, { '/': { post: CreateThing2Operation, get: GetThings2Operation } }));
// exports
export { simpleAPI, simpleAPI2, simpleAPI3, simpleAPI4, simpleAPI5, simpleAPI6, simpleAPI7 };
