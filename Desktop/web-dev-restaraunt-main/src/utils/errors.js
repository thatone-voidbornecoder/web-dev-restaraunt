// src/utils/errors.js
// HTTP error helpers used across route + middleware layers.
// Each helper returns an Error carrying a `.status` code so the central
// errorHandler can render the correct response without bespoke try/catch
// blocks in every route.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

const badRequest = (message = 'Bad request.') => new HttpError(400, message);
const unauthorized = (message = 'Authentication required.') => new HttpError(401, message);
const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, message);
const notFound = (message = 'Resource not found.') => new HttpError(404, message);
const conflict = (message = 'Resource already exists.') => new HttpError(409, message);

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
