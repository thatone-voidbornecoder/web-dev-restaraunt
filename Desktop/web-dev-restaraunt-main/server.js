// src/server.js
// Entry point. Loads .env, mounts all routes, and starts the HTTP server.
//
// Route map (all 19 spec functions wired):
//   /api/auth/*              -> customer account creation + login            (#1, #2 partial)
//   /api/customer/*          -> search, filter, dish/restaurant details,
//                               submit rating+review, manage own reviews    (#3-#9, #14 read)
//   /api/owner/*             -> create/manage own restaurant + dishes,
//                               view reviews, reply to reviews              (#10-#15)
//   /api/admin/customers     -> admin manage customers                      (#16)
//   /api/admin/owners        -> admin add/manage restaurant owners          (#17)
//   /api/admin/restaurants   -> admin restaurant management                 (#18)
//   /api/admin/reviews       -> admin review moderation                     (#19)
//
// The test UI is served from /public at the root.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { errorHandler } = require('./src/middleware/errorHandler');
const authRoutes        = require('./src/routes/auth');
const customerRoutes    = require('./src/routes/customer');
const ownerRoutes       = require('./src/routes/owner');
const adminCustomers    = require('./src/routes/adminCustomers');
const adminOwners       = require('./src/routes/adminOwners');
const adminRestaurants  = require('./src/routes/adminRestaurants');
const adminReviews      = require('./src/routes/adminReviews');
const pool              = require('./src/config/db');

const app = express();

// --- CORS ---
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowAll = allowedOrigins.includes('*');
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin (no Origin header), wildcard ('*'), or any whitelisted origin.
      if (!origin || allowAll || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Static test UI ---
app.use(express.static(path.join(__dirname, 'public')));   // was '..','public'

// --- Health check ---
app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 ? 'connected' : 'error' });
  } catch (err) {
    res.status(500).json({ status: 'db_error', error: err.message });
  }
});

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/admin/customers', adminCustomers);
app.use('/api/admin/owners', adminOwners);
app.use('/api/admin/restaurants', adminRestaurants);
app.use('/api/admin/reviews', adminReviews);

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// --- Central error handler ---
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Food Advisor backend running at http://localhost:${PORT}`);
    console.log(`Test UI:  http://localhost:${PORT}/index.html`);
    console.log(`Health:   http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
