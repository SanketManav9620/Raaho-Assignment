/**
 * An error we throw on purpose. The error handler turns it into a clean JSON response:
 *   { "error": { "code": "...", "message": "...", "details": ... } }
 */
class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code, message, details) {
    return new AppError(409, code, message, details);
  }

  static unprocessable(code, message, details) {
    return new AppError(422, code, message, details);
  }
}

module.exports = AppError;
