// src/routes/adminOwners.js
// FUNCTION 3: Add restaurant owners as an admin.
//
// All routes require an authenticated user with role = 'admin'.
// An "owner" is any user row whose role = 'owner'. Creating an owner here is
// the prerequisite before that owner can manage their own restaurant (the
// restaurants.owner_id foreign key points at these rows).
//
//   GET    /api/admin/owners            -> list/search owners
//   GET    /api/admin/owners/:id        -> fetch one owner (with their restaurants)
//   POST   /api/admin/owners            -> create a new restaurant owner
//   PATCH  /api/admin/owners/:id        -> update name/email/status
//   DELETE /api/admin/owners/:id        -> remove an owner (cascades to their restaurants)

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, query } = require('express-validator');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

// GET /api/admin/owners?search=&status=
router.get(
  '/',
  [
    query('search').optional().isString().trim(),
    query('status').optional().isIn(['active', 'suspended']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const where = ["role = 'owner'"];
      const params = [];
      if (req.query.search) {
        where.push('(name LIKE ? OR email LIKE ?)');
        const s = `%${req.query.search}%`;
        params.push(s, s);
      }
      if (req.query.status) {
        where.push('status = ?');
        params.push(req.query.status);
      }

      const [rows] = await pool.execute(
        `SELECT u.id, u.name, u.email, u.status, u.created_at,
                (SELECT COUNT(*) FROM restaurants r WHERE r.owner_id = u.id) AS restaurant_count
         FROM users u
         WHERE ${where.join(' AND ')}
         ORDER BY u.created_at DESC`,
        params,
      );
      res.json({ owners: rows });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/owners/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('id must be an integer.');

    const [owners] = await pool.execute(
      `SELECT id, name, email, role, status, created_at
       FROM users
       WHERE id = ? AND role = 'owner'`,
      [id],
    );
    if (!owners.length) throw notFound('Owner not found.');

    const [restaurants] = await pool.execute(
      `SELECT id, name, cuisine, city, is_approved, created_at
       FROM restaurants WHERE owner_id = ? ORDER BY created_at DESC`,
      [id],
    );

    res.json({ owner: owners[0], restaurants });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/owners
const createOwnerRules = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters.'),
  body('email').trim().isEmail().normalizeEmail().isLength({ max: 150 }),
  // Temporary password the admin sets; owner can change it later.
  body('password').optional().isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters.'),
];

router.post('/', createOwnerRules, validate, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const tempPassword = password || Math.random().toString(36).slice(2, 14) + 'A1!';

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email],
    );
    if (existing.length) throw conflict('An account with that email already exists.');

    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES (?, ?, ?, 'owner', 'active')`,
      [name, email, passwordHash],
    );

    res.status(201).json({
      message: 'Restaurant owner created. Share these credentials with the owner and have them change the password after first login.',
      owner: {
        id: result.insertId,
        name,
        email,
        role: 'owner',
        status: 'active',
      },
      temporaryPassword: password ? undefined : tempPassword,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/owners/:id
router.patch(
  '/:id',
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('email').optional().trim().isEmail().normalizeEmail().isLength({ max: 150 }),
    body('status').optional().isIn(['active', 'suspended']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw badRequest('id must be an integer.');
      const { name, email, status } = req.body;
      if (name === undefined && email === undefined && status === undefined) {
        throw badRequest('Nothing to update. Send name, email, and/or status.');
      }

      const [existing] = await pool.execute(
        `SELECT id FROM users WHERE id = ? AND role = 'owner'`,
        [id],
      );
      if (!existing.length) throw notFound('Owner not found.');

      if (email) {
        const [dup] = await pool.execute(
          'SELECT id FROM users WHERE email = ? AND id <> ?',
          [email, id],
        );
        if (dup.length) throw conflict('That email is already in use.');
      }

      const fields = [];
      const params = [];
      if (name !== undefined) { fields.push('name = ?'); params.push(name); }
      if (email !== undefined) { fields.push('email = ?'); params.push(email); }
      if (status !== undefined) { fields.push('status = ?'); params.push(status); }
      params.push(id);

      await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

      const [rows] = await pool.execute(
        `SELECT id, name, email, role, status, created_at FROM users WHERE id = ?`,
        [id],
      );
      res.json({ message: 'Owner updated.', owner: rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/admin/owners/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('id must be an integer.');
    if (id === req.user.id) {
      throw forbidden('Use the account-settings area to delete your own admin account.');
    }

    const [existing] = await pool.execute(
      `SELECT id FROM users WHERE id = ? AND role = 'owner'`,
      [id],
    );
    if (!existing.length) throw notFound('Owner not found.');

    // Deleting the owner cascades to restaurants, dishes, reviews on those
    // restaurants, and the owner's review_replies (per schema.sql FKs).
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Owner deleted.', id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
