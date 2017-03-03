import { Response } from 'express'

export class RESTError extends Error {
  constructor(public code:number, message?:string, public info?:any, public originalError?:any) {
    super(message);
    this.name = 'RESTError';
  }
  static send(res:Response, code:number, message?:string, info?:any) {
    res.status(code).json({
      error: code,
      message: message,
      info: info
    });
  }
}
