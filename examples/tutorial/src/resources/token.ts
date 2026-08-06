import { API, APIRequest, APIResponse, Method, Operation, OpenAPIV3, Resource } from 'arrest';

/**
 * A resource with no database behind it, built by subclassing Resource directly.
 *
 * This is the shape most real code takes: `extends MongoResource` is for collection-backed CRUD, but plenty of
 * endpoints — a login, a callback, a health probe, an /me — are just operations that share a tag, a scope and a
 * base path. That is exactly what a Resource is.
 */

/** POST /tokens — mint a token. Hand-written request body, hand-written response. */
class CreateTokenOperation extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'create');
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Exchange credentials for a token',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 8 },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'A freshly minted token',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'expiresIn'],
                properties: {
                  token: { type: 'string' },
                  expiresIn: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    };
  }

  /**
   * The body is already validated against the schema above by the time this runs — the validators that
   * `requestBody` produced are middlewares registered before the handler.
   */
  async handler(req: APIRequest, res: APIResponse): Promise<void> {
    const { email } = req.body;
    // a real implementation would verify the password and sign a JWT
    res.json({ token: Buffer.from(`${email}:tutorial`).toString('base64url'), expiresIn: 3600 });
  }
}

/** GET /tokens/current — describe the caller. `:id`-free, so no ordering trap. */
class CurrentTokenOperation extends Operation {
  constructor(resource: Resource, path: string, method: Method) {
    super(resource, path, method, 'current');
  }

  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: 'Describe the token used to make this call',
      responses: {
        '200': {
          description: 'The decoded token',
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
      },
    };
  }

  async handler(req: APIRequest, res: APIResponse): Promise<void> {
    res.json({ scopes: req.scopes ? '' + req.scopes : null, authenticated: !!req.scopes });
  }
}

export class TokenResource extends Resource {
  constructor() {
    super({
      name: 'Token',
      namePlural: 'Tokens',
      description: 'Issuing and inspecting tokens',
      routes: {
        '/': { post: CreateTokenOperation },
        '/current': { get: CurrentTokenOperation },
      },
    });
  }

  /** Shown in the OpenAPI document as the description of the resource-wide `Token` scope. */
  get scopeDescription(): string {
    return 'Full access to token issuing and inspection';
  }

  /**
   * A Resource can also register things of its own when it joins an API. Always call super — that is what
   * registers the tag, the resource scope and every operation.
   */
  attach(api: API): void {
    super.attach(api);
  }
}
