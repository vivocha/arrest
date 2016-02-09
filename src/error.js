export class RESTError extends Error {
  constructor(code, message, info, err) {
    super(message);
    this.name = 'RESTError';
    this.code = code;
    this.info = info;
    this.originalError = err;
  }
  static send(res, code, message, info) {
    res.status(code).json({
      error: code,
      message: message,
      info: info
    });
  }
}


