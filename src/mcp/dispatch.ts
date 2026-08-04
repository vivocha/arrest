import http from 'http';
import { API } from '../api.js';
import { APIRequest, APIResponse, Method } from '../types.js';

export interface InternalRequest {
  method: Method;
  /**
   * Path of the request, relative to the API router, including the query string.
   */
  url: string;
  params?: { [name: string]: any };
  query?: { [name: string]: any };
  body?: any;
  headers?: { [name: string]: string };
}

export interface InternalResponse {
  status: number;
  headers: { [name: string]: any };
  body: any;
  /**
   * The raw response payload, before any attempt at parsing it as JSON.
   */
  text: string;
}

/**
 * Perform an operation of this API as if it had been requested over HTTP, on behalf of the caller of
 * `parentReq`.
 *
 * The sub-request inherits from `parentReq` through the prototype chain, so it carries over everything
 * upstream middleware has attached to the original request - logger, scopes, ability, user, session and
 * any application specific property such as a tenant - without this module having to know about any of
 * it. The sub-request is then run through the API's own router, which means the operation's security
 * validator, parameter and body validators, handler, error handler and result redaction all apply
 * exactly as they would for a real HTTP request.
 *
 * This is what makes an MCP tool call no more privileged than the equivalent REST call: there is no
 * second code path to keep in sync, because there is no second code path.
 */
export async function dispatchInternal(api: API, parentReq: APIRequest, request: InternalRequest): Promise<InternalResponse> {
  const router = await api.router();
  const [path, search] = request.url.split('?');

  const req: APIRequest = Object.create(parentReq);
  req.method = request.method.toUpperCase();
  req.url = request.url;
  // the sub-request is handed to the API router directly, so its url is relative to the router itself and
  // the mount point of whoever is dispatching - the MCP endpoint - must not leak into it
  req.baseUrl = '';
  req.originalUrl = request.url;
  req.params = request.params || {};
  // express parses the query string of a real request in a middleware installed by the app; here the
  // caller has already split the arguments up, so the parsed query is provided directly
  Object.defineProperty(req, 'query', { value: request.query || {}, writable: true, configurable: true, enumerable: true });
  req.body = typeof request.body === 'undefined' ? {} : request.body;
  // tells body-parser the body is already available, so it doesn't try to read the (consumed) stream
  req['_body'] = true;
  if (request.headers) {
    req.headers = { ...parentReq.headers, ...request.headers };
  }
  if (search) {
    // keep the search string reachable for operations building pagination links out of originalUrl
    req['search'] = `?${search}`;
  }
  req['route'] = undefined;

  const res = new http.ServerResponse(req as any) as unknown as APIResponse;
  Object.setPrototypeOf(res, Object.getPrototypeOf(parentReq.res));
  res.req = req;
  req.res = res;
  res.locals = {};
  res.logger = parentReq.logger;

  const chunks: Buffer[] = [];
  return new Promise<InternalResponse>((resolve, reject) => {
    const collect = (chunk: any) => {
      // res.end() takes an optional callback as its first argument, which is not part of the payload
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.from(chunk));
      }
    };
    const done = () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body: any = text;
      if (/json/.test('' + (res.getHeader('content-type') || ''))) {
        try {
          body = JSON.parse(text);
        } catch (err) {
          /* leave body as the raw text */
        }
      }
      resolve({ status: res.statusCode, headers: res.getHeaders(), body, text });
    };
    res.write = ((chunk: any) => {
      collect(chunk);
      return true;
    }) as any;
    res.end = ((chunk: any) => {
      collect(chunk);
      done();
      return res;
    }) as any;

    // the router invokes this callback only when nothing has answered the request, so it can settle the
    // promise without racing with `done`
    (router as any).handle(req, res, (err: any) => {
      if (err) {
        // the router ran out of handlers with an error still pending, which means the API declined to
        // report it: there is no response to map, so the failure is surfaced to the caller
        reject(err);
      } else {
        // no handler matched the path at all
        api.handleError(API.newError(404, 'Not Found', 'the requested resource cannot be found, check the endpoint URL'), req, res);
      }
    });
  });
}
