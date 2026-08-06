import { API, APIRequest, APIResponse, Operation, OpenAPIV3, Resource } from 'arrest';

/**
 * Chapter 02 — Resources and operations.
 *
 * The same greeting, now as a real Operation subclass with a documented parameter, plus a second resource
 * showing how `path` overrides the pluralized default.
 */

class GreetOperation extends Operation {
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Greet someone by name',
      parameters: [
        {
          name: 'name',
          in: 'query',
          description: 'Who to greet',
          schema: { type: 'string', minLength: 1, default: 'world' },
        },
      ],
      responses: {
        '200': {
          description: 'The greeting',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: { message: { type: 'string' } },
              },
            },
          },
        },
      },
    };
  }

  handler(req: APIRequest, res: APIResponse) {
    // `name` is always set: the parameter declares a default, which the validator applied
    res.json({ message: `Hello, ${req.query.name}` });
  }
}

class GreetingResource extends Resource {
  constructor() {
    super({
      name: 'Greeting',
      namePlural: 'Greetings',
      description: 'Says hello, with and without a name',
    });
    this.addOperation(new GreetOperation(this, '/', 'get'));
  }
}

export async function createApi(): Promise<API> {
  const api = new API({ title: 'Tutorial API', version: '1.0.0' });

  api.addResource(new GreetingResource());

  // `path` bypasses the name-based derivation entirely, so this is /health and not /healths
  api.addResource(
    new Resource(
      { name: 'Health', path: 'health' },
      { '/': { get: (req: APIRequest, res: APIResponse) => res.json({ status: 'ok' }) } }
    )
  );

  return api;
}
