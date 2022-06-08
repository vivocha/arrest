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
  handler(req: APIRequest, res: APIResponse, next: NextFunction): any {
    if (!this[req.body.method] || !this[req.body.method].rpc) {
      next(new JSONRPCError(-32601, `Unknown method ${req.body.method}`));
    } else {
      (async () => {
        try {
          const out = await this[req.body.method](req.body.params, req, res);
          if (req.body.id) {
            res.json({
              jsonrpc: '2.0',
              result: out,
              id: req.body.id,
            });
          } else {
            res.end();
          }
        } catch (err) {
          next(err);
        }
      })();
    }
  }
  protected errorHandler(err: any, req: APIRequest, res: APIResponse, next: NextFunction) {
    if (err instanceof JSONRPCError) {
      res.json({
        jsonrpc: '2.0',
        error: {
          code: err.code,
          message: err.message,
          data: err.data,
        },
        id: req.body.id || null,
      });
    } else {
      res.json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'server error',
        },
        id: req.body.id || null,
      });
    }
  }
}
