// src/middleware/auth.js
// Authentication & role-based access control.
//
// `authenticate`  -> reads the Bearer JWT, verifies it, fetches the current
//                    user row from the database, and attaches it to req.user.
//                    A user whose status is 'suspended' is rejected here, so
//                    suspending someone in the admin panel takes effect at
//                    once even if they hold a valid token.
//
// `requireRole(...allowed)` -> returns a guard middleware that allows only the
//                    listed roles. Must run AFTER `authenticate`.

const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { unauthorized, forbidden } = require('../utils/errors');

async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw unauthorized('Missing or malformed Authorization header. Expected: Bearer <token>');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    } catch (_err) {
      throw unauthorized('Invalid or expired token. Please log in again.');
    }

    const [rows] = await pool.execute(
      'SELECT id, name, email, role, status, created_at FROM users WHERE id = ?',
      [payload.sub],
    );
    const user = rows[0];
    if (!user) throw unauthorized('Account no longer exists.');
    if (user.status === 'suspended') {
      throw forbidden('Your account has been suspended. Contact an administrator.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...allowed) {
  return function (req, _res, next) {
    if (!req.user) return next(unauthorized('Authentication required.'));
    if (!allowed.includes(req.user.role)) {
      return next(forbidden(`This action requires one of: ${allowed.join(', ')}.`));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
