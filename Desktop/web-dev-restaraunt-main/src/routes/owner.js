// src/routes/owner.js
// Restaurant-owner self-service features:
//   - create / manage their OWN restaurant profile   (Functions 12, 13)
//   - create / manage dishes on their restaurant      (Functions 10, 11)
//   - view ratings & reviews on their restaurant      (Function 14)
//   - reply to a review on their restaurant           (Function 15)
//
// Mounted at: /api/owner  (see src/server.js)
// Every route here requires a JWT-authenticated user with role 'owner'.
// Ownership is enforced per-request (a dish can only be edited if the dish's
// restaurant belongs to the requesting owner).

const express = require('express');
const { body } = require('express-validator');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { notFound } = require('../utils/errors');

const router = express.Router();
router.use(authenticate, requireRole('owner'));

const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];

const restaurantRules = [
  body('name').trim().notEmpty().withMessage('Restaurant name is required.'),
  body('cuisine').optional({ nullable: true }).trim(),
  body('city').optional({ nullable: true }).trim(),
  body('address').optional({ nullable: true }).trim(),
  body('description').optional({ nullable: true }).trim(),
  body('price_range')
    .optional({ nullable: true })
    .isIn(PRICE_RANGES)
    .withMessage('price_range must be one of $, $$, $$$, $$$$'),
  body('image_url').optional({ nullable: true }).isURL().withMessage('image_url must be a valid URL.'),
];

const dishRules = [
  body('name').trim().notEmpty().withMessage('Dish name is required.'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
  body('description').optional({ nullable: true }).trim(),
  body('category').optional({ nullable: true }).trim(),
  body('dietary_tag').optional({ nullable: true }).trim(),
  body('image_url').optional({ nullable: true }).isURL().withMessage('image_url must be a valid URL.'),
];

// Returns the restaurant row if it belongs to the owner, otherwise null.
async function loadOwnedRestaurant(ownerId, restaurantId) {
  const [rows] = await pool.query(
    `SELECT id, name, description, cuisine, city, address, price_range, image_url,
            is_approved, created_at
     FROM restaurants WHERE id = ? AND owner_id = ?`,
    [restaurantId, ownerId],
  );
  return rows[0] || null;
}

// GET /restaurants -> my restaurants
router.get('/restaurants', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.description, r.cuisine, r.city, r.address, r.price_range,
              r.image_url, r.is_approved, r.created_at,
              ROUND(AVG(rev.rating), 1) AS avg_rating,
              COUNT(rev.id) AS review_count
       FROM restaurants r
       LEFT JOIN reviews rev ON rev.restaurant_id = r.id AND rev.status = 'visible'
       WHERE r.owner_id = ?
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /restaurants -> create my restaurant
router.post('/restaurants', restaurantRules, validate, async (req, res, next) => {
  try {
    const { name, description, cuisine, city, address, price_range, image_url } = req.body;
    const [result] = await pool.query(
      `INSERT INTO restaurants (owner_id, name, description, cuisine, city, address, price_range, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, description || null, cuisine || null, city || null,
        address || null, price_range || '$$', image_url || null],
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /restaurants/:id -> update my restaurant
router.put('/restaurants/:id', restaurantRules, validate, async (req, res, next) => {
  try {
    const owned = await loadOwnedRestaurant(req.user.id, req.params.id);
    if (!owned) throw notFound('Restaurant not found or not yours.');
    const { name, description, cuisine, city, address, price_range, image_url } = req.body;
    await pool.query(
      `UPDATE restaurants
       SET name = ?, description = ?, cuisine = ?, city = ?, address = ?, price_range = ?, image_url = ?
       WHERE id = ?`,
      [name, description || null, cuisine || null, city || null,
        address || null, price_range || '$$', image_url || null, req.params.id],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /restaurants/:id -> delete my restaurant (cascades to dishes/reviews)
router.delete('/restaurants/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM restaurants WHERE id = ? AND owner_id = ?',
      [req.params.id, req.user.id],
    );
    if (result.affectedRows === 0) throw notFound('Restaurant not found or not yours.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:restaurantId/dishes -> dishes of my restaurant
router.get('/restaurants/:restaurantId/dishes', async (req, res, next) => {
  try {
    const owned = await loadOwnedRestaurant(req.user.id, req.params.restaurantId);
    if (!owned) throw notFound('Restaurant not found or not yours.');
    const [rows] = await pool.query(
      `SELECT id, name, description, price, category, dietary_tag, image_url, created_at
       FROM dishes WHERE restaurant_id = ?
       ORDER BY category, name`,
      [req.params.restaurantId],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /restaurants/:restaurantId/dishes -> create a dish on my restaurant
router.post('/restaurants/:restaurantId/dishes', dishRules, validate, async (req, res, next) => {
  try {
    const owned = await loadOwnedRestaurant(req.user.id, req.params.restaurantId);
    if (!owned) throw notFound('Restaurant not found or not yours.');
    const { name, description, price, category, dietary_tag, image_url } = req.body;
    const [result] = await pool.query(
      `INSERT INTO dishes (restaurant_id, name, description, price, category, dietary_tag, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.restaurantId, name, description || null, price,
        category || null, dietary_tag || null, image_url || null],
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /dishes/:id -> update a dish (ownership verified via its restaurant)
router.put('/dishes/:id', dishRules, validate, async (req, res, next) => {
  try {
    const { name, description, price, category, dietary_tag, image_url } = req.body;
    const [result] = await pool.query(
      `UPDATE dishes d
       JOIN restaurants r ON r.id = d.restaurant_id
       SET d.name = ?, d.description = ?, d.price = ?, d.category = ?, d.dietary_tag = ?, d.image_url = ?
       WHERE d.id = ? AND r.owner_id = ?`,
      [name, description || null, price, category || null,
        dietary_tag || null, image_url || null, req.params.id, req.user.id],
    );
    if (result.affectedRows === 0) throw notFound('Dish not found or not yours.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /dishes/:id -> delete a dish (ownership verified via its restaurant)
router.delete('/dishes/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      `DELETE d FROM dishes d
       JOIN restaurants r ON r.id = d.restaurant_id
       WHERE d.id = ? AND r.owner_id = ?`,
      [req.params.id, req.user.id],
    );
    if (result.affectedRows === 0) throw notFound('Dish not found or not yours.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:restaurantId/reviews -> all reviews on my restaurant
router.get('/restaurants/:restaurantId/reviews', async (req, res, next) => {
  try {
    const owned = await loadOwnedRestaurant(req.user.id, req.params.restaurantId);
    if (!owned) throw notFound('Restaurant not found or not yours.');
    const [rows] = await pool.query(
      `SELECT rv.id, rv.rating, rv.comment, rv.status, rv.created_at, rv.updated_at,
              u.name AS customer_name,
              rr.reply_text AS owner_reply, rr.created_at AS reply_at
       FROM reviews rv
       JOIN users u ON u.id = rv.customer_id
       LEFT JOIN review_replies rr ON rr.review_id = rv.id
       WHERE rv.restaurant_id = ?
       ORDER BY rv.created_at DESC`,
      [req.params.restaurantId],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const replyRules = [
  body('reply_text')
    .trim()
    .notEmpty()
    .withMessage('Reply text is required.')
    .isLength({ max: 2000 })
    .withMessage('Reply must be at most 2000 characters.'),
];

// POST /reviews/:id/replies -> reply to (or update a reply on) a review
// Only allowed if the review belongs to one of the owner's restaurants.
// review_replies.review_id is UNIQUE, so we upsert.
router.post('/reviews/:id/replies', replyRules, validate, async (req, res, next) => {
  try {
    const { reply_text } = req.body;
    const [rows] = await pool.query(
      `SELECT rv.id
       FROM reviews rv
       JOIN restaurants r ON r.id = rv.restaurant_id
       WHERE rv.id = ? AND r.owner_id = ?`,
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) throw notFound('Review not found or not on your restaurant.');

    await pool.query(
      `INSERT INTO review_replies (review_id, owner_id, reply_text)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE reply_text = VALUES(reply_text)`,
      [req.params.id, req.user.id, reply_text],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
