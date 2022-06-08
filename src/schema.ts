import { NextFunction } from 'connect';
import { OpenAPIV3 } from 'openapi-police';
import { API } from './api.js';
import { Operation } from './operation.js';
import { Resource } from './resource.js';
import { APIRequest, APIResponse, Method } from './types.js';

export class SchemaResource extends Resource {
  constructor() {
    super(
      {
        name: 'Schema',
      },
      {
        '/:id': {
          get: ReadSchemaOperation,
        },
      }
    );
  }
}

class ReadSchemaOperation extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'read');
  }
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Retrieve a JSON Schema by id',
      parameters: [
        {
          $ref: '#/components/parameters/id',
        },
      ],
      responses: {
        '200': {
          description: 'The requested JSON Schema',
          content: {
            'application/json': {
              schema: {
                type: 'object',
              },
            },
          },
        },
        '404': { $ref: '#/components/responses/notFound' },
        default: { $ref: '#/components/responses/defaultError' },
      },
    };
  }
  get swaggerScopes(): OpenAPIV3.OAuth2SecurityScopes {
    return {};
  }
  handler(req: APIRequest, res: APIResponse, next?: NextFunction) {
    const schema = this.api.originalSchemas[req.params.id];
    if (schema) {
      res.json(schema);
    } else {
      this.api.handleError(API.newError(404, 'not_found'), req, res);
    }
  }
}
