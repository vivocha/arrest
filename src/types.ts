import { NextFunction } from 'connect';
import { Logger } from 'debuggo';
import { Request, RequestHandler, Response } from 'express';
import { Scopes } from './scopes';

export interface APIRequest extends Request {
  scopes: Scopes;
  logger: Logger;
}
export interface APIResponse extends Response {
  logger: Logger;
}
export interface APIRequestHandler extends RequestHandler {
  (req: APIRequest, res: APIResponse, next?: NextFunction): any;
}

export type Method = "get" | "put" | "post" | "delete" | "options" | "head" | "patch";


