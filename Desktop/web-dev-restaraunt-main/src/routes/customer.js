// src/routes/customer.js
// Customer-facing browsing + review features.
// Refactored from the original "customer (1).js" router factory so it:
//   - requires the shared pool / auth / error modules directly (no factory)
//   - uses the canonical JWT auth (authenticate + requireRole('customer'))
//     instead of the old x-user-id header hack
//   - aligns to the canonical schema.sql (reviews are per-restaurant, NO
//     dish_id column; one review per customer per restaurant via the
//     UNIQUE(customer_id, restaurant_id) constraint)
//
// Mounted at: /api/customer  (see src/server.js)
//
// Public (no login):   search, filters, restaurant details, dish details,
//                      dish list + filters, view a restaurant's reviews
// Customer-only:        submit rating+review, list/edit/delete own reviews

const express = require('express');
const { body } = require('express-validator');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { notFound, conflict } = require('../utils/errors');

const router = express.Router();

const SORTS = {
  relevance: 'review_count DESC, r.name ASC',
  popularity: 'review_count DESC, r.name ASC',
  az: 'r.name ASC',
  rating: 'avg_rating DESC, review_count DESC, r.name ASC',
};

// GET /restaurants/search?q=&cuisine=&city=&price=&minRating=&sort=
router.get('/restaurants/search', async (req, res, next) => {
  try {
    const { q, cuisine, city, price, minRating, sort } = req.query;
    const conditions = ['r.is_approved = TRUE'];
    const params = [];
    const search = typeof q === 'string' ? q.trim() : '';

    if (search) {
      const like = `%${search}%`;
      conditions.push(
        `(r.name LIKE ? OR r.description LIKE ? OR r.cuisine LIKE ?
          OR EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id AND d.name LIKE ?))`,
      );
      params.push(like, like, like, like);
    }
    if (cuisine) { conditions.push('r.cuisine = ?'); params.push(cuisine); }
    if (city) { conditions.push('r.city = ?'); params.push(city); }
    if (price) { conditions.push('r.price_range = ?'); params.push(price); }

    let sql = `
      SELECT r.id, r.name, r.description, r.cuisine, r.city, r.price_range, r.image_url,
             ROUND(AVG(rev.rating), 1) AS avg_rating,
             COUNT(rev.id) AS review_count
      FROM restaurants r
      LEFT JOIN reviews rev ON rev.restaurant_id = r.id AND rev.status = 'visible'
      WHERE ${conditions.join(' AND ')}
      GROUP BY r.id`;

    const minR = parseFloat(minRating);
    if (minR > 0 && minR <= 5) {
      sql += ' HAVING COALESCE(AVG(rev.rating), 0) >= ?';
      params.push(minR);
    }

    const key = Object.prototype.hasOwnProperty.call(SORTS, sort) ? sort : 'relevance';
    sql += ` ORDER BY ${SORTS[key]}`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /filters -> distinct cuisines + cities (drives filter UI)
router.get('/filters', async (_req, res, next) => {
  try {
    const [cuisines] = await pool.query(
      `SELECT DISTINCT cuisine FROM restaurants
       WHERE is_approved = TRUE AND cuisine IS NOT NULL ORDER BY cuisine`,
    );
    const [cities] = await pool.query(
      `SELECT DISTINCT city FROM restaurants
       WHERE is_approved = TRUE AND city IS NOT NULL ORDER BY city`,
    );
    res.json({
      cuisines: cuisines.map((r) => r.cuisine),
      cities: cities.map((r) => r.city),
    });
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:id -> restaurant details (+ owner name, avg rating)
router.get('/restaurants/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.description, r.cuisine, r.city, r.address,
              r.price_range, r.image_url, r.is_approved, r.created_at,
              u.name AS owner_name,
              ROUND(AVG(rev.rating), 1) AS avg_rating,
              COUNT(rev.id) AS review_count
       FROM restaurants r
       JOIN users u ON u.id = r.owner_id
       LEFT JOIN reviews rev ON rev.restaurant_id = r.id AND rev.status = 'visible'
       WHERE r.id = ? AND r.is_approved = TRUE
       GROUP BY r.id`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Restaurant not found.');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:id/dishes?category=&dietary=&max_price= -> filtered dish list
router.get('/restaurants/:id/dishes', async (req, res, next) => {
  try {
    const { category, dietary, max_price } = req.query;
    const conditions = ['d.restaurant_id = ?', 'r.is_approved = TRUE'];
    const params = [req.params.id];
    if (category) { conditions.push('d.category = ?'); params.push(category); }
    if (dietary) { conditions.push('d.dietary_tag = ?'); params.push(dietary); }
    if (max_price) {
      const mp = parseFloat(max_price);
      if (!Number.isNaN(mp)) { conditions.push('d.price <= ?'); params.push(mp); }
    }
    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.description, d.price, d.category, d.dietary_tag,
              d.image_url, d.created_at
       FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.category, d.name`,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /dishes/:id -> single dish details
router.get('/dishes/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.restaurant_id, r.name AS restaurant_name, d.name, d.description,
              d.price, d.category, d.dietary_tag, d.image_url, d.created_at
       FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
       WHERE d.id = ? AND r.is_approved = TRUE`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Dish not found.');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:id/reviews -> visible reviews (+ owner reply)
router.get('/restaurants/:id/reviews', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT rv.id, rv.rating, rv.comment, rr.reply_text AS owner_reply,
              u.name AS customer_name, rv.created_at, rv.updated_at
       FROM reviews rv
       JOIN users u ON u.id = rv.customer_id
       LEFT JOIN review_replies rr ON rr.review_id = rv.id
       WHERE rv.restaurant_id = ? AND rv.status = 'visible'
       ORDER BY rv.created_at DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const reviewRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be a whole number from 1 to 5.'),
  body('comment')
    .optional({ nullable: true })
    .isLength({ min: 5, max: 1000 })
    .withMessage('Review must be between 5 and 1000 characters.'),
];

// POST /restaurants/:id/reviews -> submit rating + review (customer only)
router.post(
  '/restaurants/:id/reviews',
  authenticate,
  requireRole('customer'),
  reviewRules,
  validate,
  async (req, res, next) => {
    try {
      const [rest] = await pool.query(
        'SELECT id FROM restaurants WHERE id = ? AND is_approved = TRUE',
        [req.params.id],
      );
      if (rest.length === 0) throw notFound('Restaurant not found.');

      const { rating, comment } = req.body;
      try {
        const [result] = await pool.query(
          'INSERT INTO reviews (restaurant_id, customer_id, rating, comment) VALUES (?, ?, ?, ?)',
          [req.params.id, req.user.id, rating, comment || null],
        );
        res.status(201).json({ id: result.insertId });
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
          throw conflict('You already reviewed this restaurant. Edit your existing review instead.');
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// GET /my/reviews -> the customer's own reviews
router.get('/my/reviews', authenticate, requireRole('customer'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT rv.id, rv.restaurant_id, r.name AS restaurant_name,
              rv.rating, rv.comment, rv.status, rv.created_at, rv.updated_at
       FROM reviews rv JOIN restaurants r ON r.id = rv.restaurant_id
       WHERE rv.customer_id = ?
       ORDER BY rv.updated_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PUT /reviews/:id -> edit own review (customer only)
router.put(
  '/reviews/:id',
  authenticate,
  requireRole('customer'),
  reviewRules,
  validate,
  async (req, res, next) => {
    try {
      const { rating, comment } = req.body;
      const [result] = await pool.query(
        'UPDATE reviews SET rating = ?, comment = ? WHERE id = ? AND customer_id = ?',
        [rating, comment || null, req.params.id, req.user.id],
      );
      if (result.affectedRows === 0) throw notFound('Review not found or not yours.');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /reviews/:id -> delete own review (customer only)
router.delete('/reviews/:id', authenticate, requireRole('customer'), async (req, res, next) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM reviews WHERE id = ? AND customer_id = ?',
      [req.params.id, req.user.id],
    );
    if (result.affectedRows === 0) throw notFound('Review not found or not yours.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
