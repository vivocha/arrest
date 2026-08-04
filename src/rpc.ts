import { NextFunction } from 'express';
import { OpenAPIV3 } from 'openapi-police';
import { Operation } from './operation.js';
import { APIRequest, APIResponse } from './types.js';

export function rpc(target: JSONRPC, propertyKey: string) {
  target[propertyKey].rpc = true;
}

export class JSONRPCError extends Error {
  constructor(public code: number, message: string, public data?: any) {
    super(message);
  }
}

export abstract class JSONRPC extends Operation {
  protected getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      summary: `Perform a Remote Procedure Call`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['jsonrpc', 'method'],
              additionalProperties: false,
              properties: {
                jsonrpc: {
                  enum: ['2.0'],
                },
                method: {
                  type: 'string',
                  minLength: 1,
                },
                params: {
                  oneOf: [{ type: 'object' }, { type: 'array' }],
                },
                id: {
                  oneOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }],
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: `List of matching ${this.resource.info.namePlural}`,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['jsonrpc', 'id'],
                additionalProperties: false,
                properties: {
                  jsonrpc: {
                    enum: ['2.0'],
                  },
                  result: {},
                  error: {
                    type: 'object',
                    required: ['code', 'message'],
                    additionalProperties: false,
                    properties: {
                      code: {
                        type: 'integer',
                      },
                      message: {
                        type: 'string',
                        minLength: 1,
                      },
                      data: {},
                    },
                  },
                  id: {
                    oneOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }],
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  /**
   * HTTP status code used to acknowledge a JSON-RPC notification (a request without an id).
   * Subclasses speaking protocols that mandate a specific code (e.g. MCP requires 202) can override it.
   */
  protected get notificationStatus(): number {
    return 200;
  }
  /**
   * A JSON-RPC request is a notification only when the id is absent or null. Note that 0 and the
   * empty string are perfectly valid ids and must not be treated as notifications.
   */
  protected isNotification(body: any): boolean {
    return typeof body.id === 'undefined' || body.id === null;
  }
  protected requestId(body: any = {}): string | number | null {
    return this.isNotification(body) ? null : body.id;
  }
  /**
   * Whether this request carries a JSON-RPC envelope, i.e. whether the body was parsed at all. A request
   * rejected before that point - typically by the security validator, which runs first - has no JSON-RPC
   * request to answer, so it must be reported as a plain HTTP error: an MCP client needs to see the 401
   * or 403 to know it has to authenticate.
   */
  protected isRPCRequest(req: APIRequest): boolean {
    return !!req.body && typeof req.body === 'object';
  }
  /**
   * Resolve and invoke a method. Subclasses can override to implement a different lookup strategy,
   * as long as unknown methods keep throwing a -32601 JSONRPCError.
   */
  protected async dispatch(method: string, params: any, req: APIRequest, res: APIResponse): Promise<any> {
    if (typeof method !== 'string' || !this[method] || !this[method].rpc) {
      throw new JSONRPCError(-32601, `Unknown method ${method}`);
    }
    return this[method](params, req, res);
  }
  handler(req: APIRequest, res: APIResponse, next: NextFunction): any {
    (async () => {
      try {
        const out = await this.dispatch(req.body.method, req.body.params, req, res);
        if (res.writableEnded) {
          // the method has taken over the response
        } else if (this.isNotification(req.body)) {
          res.status(this.notificationStatus).end();
        } else {
          res.json({
            jsonrpc: '2.0',
            result: out,
            id: req.body.id,
          });
        }
      } catch (err) {
        next(err);
      }
    })();
  }
  protected errorHandler(err: any, req: APIRequest, res: APIResponse, next: NextFunction) {
    if (!this.isRPCRequest(req) && !(err instanceof JSONRPCError)) {
      // the request never reached the JSON-RPC layer: let the API report it as a plain HTTP error
      next(err);
    } else if (err instanceof JSONRPCError) {
      res.json({
        jsonrpc: '2.0',
        error: {
          code: err.code,
          message: err.message,
          data: err.data,
        },
        id: this.requestId(req.body),
      });
    } else {
      res.json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'server error',
        },
        id: this.requestId(req.body),
      });
    }
  }
}
