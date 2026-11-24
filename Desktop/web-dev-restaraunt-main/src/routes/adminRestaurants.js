// src/routes/adminRestaurants.js
// FUNCTION 4: Manage restaurants as an admin.
//
// All routes require an authenticated user with role = 'admin'.
// Admins oversee restaurants regardless of which owner owns them; here they can
// add, list, fetch, edit, approve/un-approve and remove any restaurant.
//
//   GET    /api/admin/restaurants                -> list/search restaurants
//   GET    /api/admin/restaurants/:id           -> fetch one restaurant (with dishes)
//   POST   /api/admin/restaurants               -> create a restaurant (owner_id required)
//   PATCH  /api/admin/restaurants/:id           -> update restaurant fields
//   PATCH  /api/admin/restaurants/:id/approve   -> set is_approved true/false
//   DELETE /api/admin/restaurants/:id           -> remove a restaurant

const express = require('express');
const { body, query } = require('express-validator');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { badRequest, notFound } = require('../utils/errors');

const router = express.Router();
const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];

router.use(authenticate, requireRole('admin'));

// GET /api/admin/restaurants?search=&cuisine=&city=&is_approved=&owner_id=
router.get(
  '/',
  [
    query('search').optional().isString().trim(),
    query('cuisine').optional().isString().trim(),
    query('city').optional().isString().trim(),
    query('is_approved').optional().isBoolean(),
    query('owner_id').optional().isInt().toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const where = [];
      const params = [];
      if (req.query.search) {
        where.push('(r.name LIKE ? OR r.description LIKE ?)');
        const s = `%${req.query.search}%`;
        params.push(s, s);
      }
      if (req.query.cuisine) { where.push('r.cuisine = ?'); params.push(req.query.cuisine); }
      if (req.query.city) { where.push('r.city = ?'); params.push(req.query.city); }
      if (req.query.is_approved !== undefined) {
        where.push('r.is_approved = ?');
        params.push(req.query.is_approved === 'true' || req.query.is_approved === true ? 1 : 0);
      }
      if (req.query.owner_id) { where.push('r.owner_id = ?'); params.push(req.query.owner_id); }

      const sql = `SELECT r.id, r.owner_id, u.name AS owner_name, r.name, r.description,
                          r.cuisine, r.city, r.address, r.price_range, r.image_url,
                          r.is_approved, r.created_at
                   FROM restaurants r
                   JOIN users u ON u.id = r.owner_id
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY r.created_at DESC`;
      const [rows] = await pool.execute(sql, params);
      res.json({ restaurants: rows });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/restaurants/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('id must be an integer.');

    const [rows] = await pool.execute(
      `SELECT r.id, r.owner_id, u.name AS owner_name, u.email AS owner_email,
              r.name, r.description, r.cuisine, r.city, r.address,
              r.price_range, r.image_url, r.is_approved, r.created_at
       FROM restaurants r
       JOIN users u ON u.id = r.owner_id
       WHERE r.id = ?`,
      [id],
    );
    if (!rows.length) throw notFound('Restaurant not found.');

    const [dishes] = await pool.execute(
      `SELECT id, name, description, price, category, dietary_tag, image_url, created_at
       FROM dishes WHERE restaurant_id = ? ORDER BY created_at DESC`,
      [id],
    );

    res.json({ restaurant: rows[0], dishes });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/restaurants
const createRules = [
  body('owner_id').isInt({ min: 1 }).withMessage('owner_id must reference an existing owner.'),
  body('name').trim().isLength({ min: 2, max: 150 }),
  body('description').optional().isString().trim(),
  body('cuisine').optional().isString().trim().isLength({ max: 80 }),
  body('city').optional().isString().trim().isLength({ max: 80 }),
  body('address').optional().isString().trim().isLength({ max: 255 }),
  body('price_range').optional().isIn(PRICE_RANGES).withMessage(`price_range must be one of ${PRICE_RANGES.join(',')}`),
  body('image_url').optional().isURL().isLength({ max: 500 }),
  body('is_approved').optional().isBoolean(),
];

router.post('/', createRules, validate, async (req, res, next) => {
  try {
    const {
      owner_id, name, description = null, cuisine = null, city = null,
      address = null, price_range = '$$', image_url = null, is_approved = true,
    } = req.body;

    // Confirm owner_id really is an owner.
    const [ownerRows] = await pool.execute(
      `SELECT id FROM users WHERE id = ? AND role = 'owner'`,
      [owner_id],
    );
    if (!ownerRows.length) {
      throw badRequest('owner_id does not reference an active restaurant owner. Create the owner first via /api/admin/owners.');
    }

    const [result] = await pool.execute(
      `INSERT INTO restaurants
         (owner_id, name, description, cuisine, city, address, price_range, image_url, is_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [owner_id, name, description, cuisine, city, address, price_range, image_url, is_approved ? 1 : 0],
    );

    const [rows] = await pool.execute(
      `SELECT id, owner_id, name, description, cuisine, city, address, price_range, image_url, is_approved, created_at
       FROM restaurants WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ message: 'Restaurant created.', restaurant: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/restaurants/:id
const updateRules = [
  body('owner_id').optional().isInt({ min: 1 }),
  body('name').optional().trim().isLength({ min: 2, max: 150 }),
  body('description').optional().isString().trim(),
  body('cuisine').optional().isString().trim().isLength({ max: 80 }),
  body('city').optional().isString().trim().isLength({ max: 80 }),
  body('address').optional().isString().trim().isLength({ max: 255 }),
  body('price_range').optional().isIn(PRICE_RANGES),
  body('image_url').optional().isURL().isLength({ max: 500 }),
  body('is_approved').optional().isBoolean(),
];

router.patch('/:id', updateRules, validate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('id must be an integer.');

    const [existing] = await pool.execute('SELECT id FROM restaurants WHERE id = ?', [id]);
    if (!existing.length) throw notFound('Restaurant not found.');

    const fields = [];
    const params = [];
    const {
      owner_id, name, description, cuisine, city, address, price_range, image_url, is_approved,
    } = req.body;

    if (owner_id !== undefined) {
      const [ownerRows] = await pool.execute(
        `SELECT id FROM users WHERE id = ? AND role = 'owner'`,
        [owner_id],
      );
      if (!ownerRows.length) throw badRequest('owner_id does not reference an active owner.');
      fields.push('owner_id = ?'); params.push(owner_id);
    }
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (cuisine !== undefined) { fields.push('cuisine = ?'); params.push(cuisine); }
    if (city !== undefined) { fields.push('city = ?'); params.push(city); }
    if (address !== undefined) { fields.push('address = ?'); params.push(address); }
    if (price_range !== undefined) { fields.push('price_range = ?'); params.push(price_range); }
    if (image_url !== undefined) { fields.push('image_url = ?'); params.push(image_url); }
    if (is_approved !== undefined) { fields.push('is_approved = ?'); params.push(is_approved ? 1 : 0); }

    if (!fields.length) throw badRequest('Nothing to update.');

    params.push(id);
    await pool.execute(`UPDATE restaurants SET ${fields.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.execute(
      `SELECT id, owner_id, name, description, cuisine, city, address, price_range, image_url, is_approved, created_at
       FROM restaurants WHERE id = ?`,
      [id],
    );
    res.json({ message: 'Restaurant updated.', restaurant: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/restaurants/:id/approve   { is_approved: true|false }
router.patch(
  '/:id/approve',
  [body('is_approved').isBoolean().withMessage('is_approved (boolean) is required.')],
  validate,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw badRequest('id must be an integer.');

      const [result] = await pool.execute(
        'UPDATE restaurants SET is_approved = ? WHERE id = ?',
        [req.body.is_approved ? 1 : 0, id],
      );
      if (result.affectedRows === 0) throw notFound('Restaurant not found.');

      const [rows] = await pool.execute(
        'SELECT id, name, is_approved FROM restaurants WHERE id = ?',
        [id],
      );
      res.json({
        message: req.body.is_approved ? 'Restaurant approved.' : 'Restaurant un-approved.',
        restaurant: rows[0],
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/admin/restaurants/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('id must be an integer.');

    const [result] = await pool.execute('DELETE FROM restaurants WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw notFound('Restaurant not found.');

    res.json({ message: 'Restaurant deleted.', id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
