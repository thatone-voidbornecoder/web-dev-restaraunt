// src/middleware/errorHandler.js
// Two pieces:
//   validate      -> runs AFTER express-validator rules; throws a 400 HttpError
//                    if any validation rule failed, otherwise calls next().
//   errorHandler  -> the terminal Express error handler. Maps HttpError to its
//                    status, translates MySQL duplicate-key errors to 409, and
//                    falls back to 500 for anything unexpected.

const { validationResult } = require('express-validator');
const { HttpError, conflict } = require('../utils/errors');

function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const message = result
    .array()
    .map((e) => e.msg)
    .join('; ');
  return next(new HttpError(400, message));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // MySQL duplicate key -> 409 Conflict (e.g. unique email, one-review-per-customer)
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }

  // Express body-parser limit / JSON parse errors -> 400
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
}

module.exports = { validate, errorHandler };
