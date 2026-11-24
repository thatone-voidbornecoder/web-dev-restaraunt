// src/routes/adminCustomers.js
// FUNCTION 2: Manage customers as an admin.
//
// All routes require an authenticated user with role = 'admin'.
// A "customer" here is any user row whose role = 'customer'.
//
//   GET    /api/admin/customers            -> list/search customers (paginated)
//   GET    /api/admin/customers/:id        -> fetch one customer
//   PATCH  /api/admin/customers/:id        -> update name/email and/or status
//   DELETE /api/admin/customers/:id        -> remove a customer
//
// Admins cannot accidentally delete or edit themselves through this endpoint,
// and cannot target non-customer accounts here (owners are managed in
// adminOwners.js, admins are out of scope).

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, query } = require('express-validator');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');

const router = express.Router();

// All routes below are admin-only.
router.use(authenticate, requireRole('admin'));

// GET /api/admin/customers?search=&status=&page=&limit=
router.get(
  '/',
  [
    query('search').optional().isString().trim(),
    query('status').optional().isIn(['active', 'suspended']).withMessage('status must be active or suspended'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const offset = (page - 1) * limit;
      const where = ["role = 'customer'"];
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

      const sql = `SELECT id, name, email, role, status, created_at
                   FROM users
                   WHERE ${where.join(' AND ')}
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [rows] = await pool.execute(sql, params);

      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total FROM users WHERE ${where.join(' AND ')}`,
        params.slice(0, -2),
      );
      const total = countRows[0].total;

      res.json({
        page,
        limit,
        total,
        customers: rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/customers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('id must be an integer.');

    const [rows] = await pool.execute(
      `SELECT id, name, email, role, status, created_at
       FROM users
       WHERE id = ? AND role = 'customer'`,
      [id],
    );
    if (!rows.length) throw notFound('Customer not found.');
    res.json({ customer: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/customers/:id
router.patch(
  '/:id',
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('email').optional().trim().isEmail().normalizeEmail().isLength({ max: 150 }),
    body('status').optional().isIn(['active', 'suspended']).withMessage('status must be active or suspended'),
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
        `SELECT id FROM users WHERE id = ? AND role = 'customer'`,
        [id],
      );
      if (!existing.length) throw notFound('Customer not found.');

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
      res.json({ message: 'Customer updated.', customer: rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/admin/customers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('id must be an integer.');

    // Prevent an admin from deleting their own account through this endpoint.
    if (id === req.user.id) {
      throw forbidden('Use the account-settings area to delete your own admin account.');
    }

    const [existing] = await pool.execute(
      `SELECT id FROM users WHERE id = ? AND role = 'customer'`,
      [id],
    );
    if (!existing.length) throw notFound('Customer not found.');

    // ON DELETE CASCADE in schema.sql cleans up reviews, review_replies, etc.
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Customer deleted.', id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
