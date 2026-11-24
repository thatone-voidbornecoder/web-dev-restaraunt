// src/routes/auth.js
// FUNCTION 1: Customer account creation.
//
// Public endpoints:
//   POST /api/auth/register  -> create a CUSTOMER account (role forced to 'customer')
//   POST /api/auth/login     -> exchange credentials for a JWT
//   GET  /api/auth/me         -> return the authenticated user's profile
//
// Notes:
//   - Registration always creates a 'customer'. Admins and owners are created
//     through their own admin-only endpoints (see routes/admin.js).
//   - Passwords are hashed with bcrypt (cost 10) before storage.
//   - We never return password_hash, not even after creation.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { badRequest, conflict, unauthorized } = require('../utils/errors');

const router = express.Router();

const registerRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters.'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email is required.')
    .isLength({ max: 150 })
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8-72 characters.'),
];

// POST /api/auth/register
router.post('/register', registerRules, validate, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email],
    );
    if (existing.length) {
      throw conflict('An account with that email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES (?, ?, ?, 'customer', 'active')`,
      [name, email, passwordHash],
    );

    const userId = result.insertId;
    const token = jwt.sign(
      { sub: userId, role: 'customer' },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
    );

    return res.status(201).json({
      message: 'Customer account created.',
      user: { id: userId, name, email, role: 'customer', status: 'active' },
      token,
    });
  } catch (err) {
    next(err);
  }
});

const loginRules = [
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

// POST /api/auth/login
router.post('/login', loginRules, validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash, role, status FROM users WHERE email = ?',
      [email],
    );
    const user = rows[0];
    if (!user) throw unauthorized('Invalid email or password.');
    if (user.status === 'suspended') {
      throw unauthorized('Your account has been suspended. Contact an administrator.');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw unauthorized('Invalid email or password.');

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
    );

    return res.json({
      message: 'Login successful.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
