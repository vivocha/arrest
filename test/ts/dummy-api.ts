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

export default simpleAPI;
// api.listen(8888);
