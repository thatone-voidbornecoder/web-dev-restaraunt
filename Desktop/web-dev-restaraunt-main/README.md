# FoodAdvisor

Restaurant review platform with three roles: **customers**, **restaurant owners (R.O.s)**, and an **administrator**.

This is the cleaned-up, single-architecture version of the team's files. It consolidates the JWT-based API (`auth`, `adminCustomers/Owners/Restaurants`), the customer browsing/review router, the owner dish/restaurant/reply features, and the admin review moderation into one Express project laid out the way `server.js` expects.

---

## Architecture

```
foodadvisor/
├── package.json
├── .env.example            # copy to .env and fill in DB + JWT settings
├── schema.sql              # canonical DB schema (users, restaurants, dishes, reviews, review_replies)
├── sample_data.sql         # demo rows (password for every account: password123)
├── README.md
├── public/                 # static test UI served at the root
│   ├── index.html          # landing page + role links
│   ├── common.js           # shared fetch helper (JWT in localStorage) + auth guards
│   ├── login.html / login.js
│   ├── customer.html / customer.js
│   ├── owner.html / owner.js
│   └── admin.html / admin.js
└── src/
    ├── server.js           # entry point; mounts every route group
    ├── config/
    │   └── db.js           # mysql2/promise pool from env
    ├── middleware/
    │   ├── auth.js         # authenticate (Bearer JWT) + requireRole(...)
    │   └── errorHandler.js # validate() + central errorHandler
    ├── utils/
    │   └── errors.js       # HttpError helpers (badRequest/notFound/conflict/...)
    └── routes/
        ├── auth.js             # /api/auth            register / login / me
        ├── customer.js         # /api/customer        search, filter, dish & restaurant details, reviews CRUD
        ├── owner.js            # /api/owner           restaurant + dish CRUD, view reviews, reply
        ├── adminCustomers.js   # /api/admin/customers
        ├── adminOwners.js      # /api/admin/owners
        ├── adminRestaurants.js # /api/admin/restaurants
        └── adminReviews.js     # /api/admin/reviews   review moderation
```

Auth strategy is **JWT + bcrypt** (Bearer token in the `Authorization` header). The session-based Hasi app and the `x-user-id` header hack from the old `customer (1).js` were reconciled to this single strategy.

---

## Setup

```bash
# 1. Database
mysql -u root -p < schema.sql
mysql -u root -p food_review_app < sample_data.sql

# 2. Backend
cp .env.example .env          # then edit DB_PASSWORD + JWT_SECRET
npm install
npm start                     # http://localhost:4000

# 3. Open the UI
#    http://localhost:4000/index.html
```

Demo accounts (password `password123` for all):

| Role     | Email                     |
|----------|---------------------------|
| admin    | admin@foodadvisor.com     |
| owner    | nathan@foodadvisor.com    |
| owner    | ishaan@foodadvisor.com    |
| customer | adeeb@foodadvisor.com     |
| customer | hasini@foodadvisor.com    |
| customer | samriddhi@foodadvisor.com |

---

## Route map -> spec functions

| #  | Role        | Function                              | Endpoint(s) |
|----|-------------|---------------------------------------|-------------|
| 1  | Customer    | Create account                        | `POST /api/auth/register` |
| 2  | Customer    | Manage account                        | `GET/PUT/DELETE /api/auth/me` (profile via `me`) |
| 3  | Customer    | Search restaurants                    | `GET /api/customer/restaurants/search?q=` |
| 4  | Customer    | Filter results                        | `GET /api/customer/restaurants/search?cuisine=&city=&price=&minRating=` , `GET /api/customer/restaurants/:id/dishes?category=&dietary=&max_price=`, `GET /api/customer/filters` |
| 5  | Customer    | Dish details                          | `GET /api/customer/dishes/:id` |
| 6  | Customer    | Restaurant details                    | `GET /api/customer/restaurants/:id` |
| 7  | Customer    | Submit ratings                        | `POST /api/customer/restaurants/:id/reviews` |
| 8  | Customer    | Post reviews                          | `POST /api/customer/restaurants/:id/reviews` (rating + comment in one record) |
| 9  | Customer    | Manage reviews                        | `GET /api/customer/my/reviews`, `PUT/DELETE /api/customer/reviews/:id` |
| 10 | Owner       | Create dish information               | `POST /api/owner/restaurants/:restaurantId/dishes` |
| 11 | Owner       | Manage dish information               | `GET /api/owner/restaurants/:restaurantId/dishes`, `PUT/DELETE /api/owner/dishes/:id` |
| 12 | Owner       | Create restaurant information         | `POST /api/owner/restaurants` |
| 13 | Owner       | Manage restaurant information         | `GET/PUT/DELETE /api/owner/restaurants/:id` |
| 14 | Owner       | View ratings and reviews              | `GET /api/owner/restaurants/:restaurantId/reviews` |
| 15 | Owner       | Reply to reviews                      | `POST /api/owner/reviews/:id/replies` |
| 16 | Admin       | Manage customers                      | `GET/PATCH/DELETE /api/admin/customers/:id` |
| 17 | Admin       | Add restaurant owners                 | `POST /api/admin/owners` |
| 18 | Admin       | Restaurant management                 | `GET/POST/PATCH/DELETE /api/admin/restaurants/:id`, `PATCH /api/admin/restaurants/:id/approve` |
| 19 | Admin       | Manage reviews                        | `GET/PATCH/DELETE /api/admin/reviews/:id` |

---

## What was reconciled (vs. the original scattered files)

- **Missing modules created** — the route files `require`d `./config/db`, `./middleware/errorHandler`, and `./utils/errors`, but none were uploaded. All three are now implemented (`src/config/db.js`, `src/middleware/errorHandler.js`, `src/utils/errors.js`).
- **Customer router was dead code** — `customer (1).js` was a router factory that `server.js` never mounted. Refactored into `src/routes/customer.js` (exports a router, requires the shared pool/auth directly) and **mounted at `/api/customer`**.
- **Auth reconciled to JWT** — the old customer router used an `x-user-id` header hack; the Hasi app used sessions. Both replaced with the canonical `authenticate` + `requireRole('customer')` JWT guards.
- **Schema alignment** — the old customer router wrote a `dish_id` column on `reviews`; the canonical `schema.sql` has no such column (reviews are per-restaurant with `UNIQUE(customer_id, restaurant_id)`). The new router drops `dish_id` and relies on the unique constraint + `ER_DUP_ENTRY` to prevent double-reviewing.
- **Owner features added** — `src/routes/owner.js` ports Nathan's standalone dish CRUD (`files/server.js`) into the JWT/`requireRole('owner')` architecture, **adds owner-self-service restaurant create/manage** (was admin-gated only), and **adds reply-to-review** (`review_replies` was read-only before). Ownership is enforced per request.
- **Admin review moderation added** — `src/routes/adminReviews.js` implements Function 19 (`reviews.status` visible/hidden/flagged + delete), which had no backend anywhere in the original drop.
- **`server.js` extended** — mounts `customer`, `owner`, and `adminReviews` in addition to the original four route groups, so all 19 functions are wired.
- **Duplicates removed** — the byte-identical `files/` ≡ `owner-simple/` pair, the two `owner.js` files with disjoint features, and the duplicate signup/manage-account backends are consolidated into the single tree above.

---

## Notes / assumptions

- `reviews.status` is `visible` by default; only `visible` reviews are shown to customers and counted in average ratings. Owners see all statuses on their own restaurants; admins see all.
- One review per customer per restaurant is enforced by the schema's `UNIQUE(customer_id, restaurant_id)`.
- One reply per review is enforced by `review_replies.review_id` being `UNIQUE`; re-posting a reply updates the existing text.
- Restaurants created by owners are `is_approved = TRUE` by default (matching the schema). The admin approval toggle (`PATCH /api/admin/restaurants/:id/approve`) remains available.
