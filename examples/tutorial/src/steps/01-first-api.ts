import { API, APIRequest, APIResponse, Resource } from 'arrest';

/**
 * Chapter 01 — Your first API.
 *
 * One resource, one operation, written as a plain Express handler: arrest wraps it in a SimpleOperation, so
 * it appears in the OpenAPI document like any other operation.
 */
export async function createApi(): Promise<API> {
  const api = new API({
    title: 'Tutorial API',
    version: '1.0.0',
    description: 'The API we build over the course of the arrest tutorial',
  });

  api.addResource(
    new Resource(
      { name: 'Greeting', namePlural: 'Greetings' },
      {
        '/': {
          get: (req: APIRequest, res: APIResponse) => {
            res.json({ message: 'Hello from arrest' });
          },
        },
      }
    )
  );

  return api;
}
