export class RESTError extends Error {
  constructor(code, message, info, err) {
    super(message);
    this.name = 'RESTError';
    this.code = code;
    this.info = info;
    this.originalError = err;
  }
  send(res) {
    RESTError.send(res, this.code || 500, this.message, this.info);
  }
  static send(res, code, message, info) {
    res.status(code).json({
      error: code,
      message: message,
      info: info
    });
  }
}


