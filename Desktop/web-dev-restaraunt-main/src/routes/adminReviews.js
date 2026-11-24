// src/routes/adminReviews.js
// Administrator review moderation (Function 19).
// Mounted at: /api/admin/reviews  (see src/server.js)
// All routes require a JWT-authenticated user with role 'admin'.

const express = require('express');
const { body } = require('express-validator');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { notFound } = require('../utils/errors');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const STATUS_VALUES = ['visible', 'hidden', 'flagged'];

// GET / -> all reviews (optionally filter by ?status=&restaurant_id=)
router.get('/', async (req, res, next) => {
  try {
    const { status, restaurant_id } = req.query;
    const where = [];
    const params = [];
    if (status) { where.push('rv.status = ?'); params.push(status); }
    if (restaurant_id) {
      const rid = Number(restaurant_id);
      if (!Number.isNaN(rid)) { where.push('rv.restaurant_id = ?'); params.push(rid); }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT rv.id, rv.restaurant_id, r.name AS restaurant_name,
              rv.customer_id, u.name AS customer_name,
              rv.rating, rv.comment, rv.status, rv.created_at, rv.updated_at,
              rr.reply_text AS owner_reply
       FROM reviews rv
       JOIN restaurants r ON r.id = rv.restaurant_id
       JOIN users u ON u.id = rv.customer_id
       LEFT JOIN review_replies rr ON rr.review_id = rv.id
       ${clause}
       ORDER BY rv.created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id -> one review (full detail)
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT rv.id, rv.restaurant_id, r.name AS restaurant_name,
              rv.customer_id, u.name AS customer_name,
              rv.rating, rv.comment, rv.status, rv.created_at, rv.updated_at,
              rr.reply_text AS owner_reply
       FROM reviews rv
       JOIN restaurants r ON r.id = rv.restaurant_id
       JOIN users u ON u.id = rv.customer_id
       LEFT JOIN review_replies rr ON rr.review_id = rv.id
       WHERE rv.id = ?`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Review not found.');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id -> change a review's status (visible / hidden / flagged)
router.patch(
  '/:id',
  [body('status').isIn(STATUS_VALUES).withMessage('status must be visible, hidden, or flagged.')],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query(
        'UPDATE reviews SET status = ? WHERE id = ?',
        [req.body.status, req.params.id],
      );
      if (result.affectedRows === 0) throw notFound('Review not found.');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /:id -> permanently delete a review
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw notFound('Review not found.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
