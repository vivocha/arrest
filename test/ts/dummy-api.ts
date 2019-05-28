import { API } from '../../dist/api';
import { Operation } from '../../dist/operation';
import { Resource } from '../../dist/resource';

const api = new API();

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
      type: 'object',
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

api.addResource(new Resource({ name: 'Test' }, { '/a': { post: Op1 } }));
api.listen(8888);
