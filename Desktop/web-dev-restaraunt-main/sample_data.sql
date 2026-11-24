-- sample_data.sql for FoodAdvisor
-- All demo accounts use the password: password123
-- (bcrypt cost-10 hash below; verified against bcryptjs / Python bcrypt).
--
-- Load AFTER schema.sql:
--   mysql -u root -p < schema.sql
--   mysql -u root -p food_review_app < sample_data.sql

USE food_review_app;

-- 1. Users (1 admin, 2 owners, 3 customers)
INSERT INTO users (id, name, email, password_hash, role, status) VALUES
  (1, 'Site Admin',     'admin@foodadvisor.com',      '$2b$10$hTjq0F0mcaunrskqIwTBsOwT.moxyKuTbFWV6cphxuJW8/.5OG1BO', 'admin',    'active'),
  (2, 'Nathan',         'nathan@foodadvisor.com',     '$2b$10$hTjq0F0mcaunrskqIwTBsOwT.moxyKuTbFWV6cphxuJW8/.5OG1BO', 'owner',    'active'),
  (3, 'Ishaan',         'ishaan@foodadvisor.com',     '$2b$10$hTjq0F0mcaunrskqIwTBsOwT.moxyKuTbFWV6cphxuJW8/.5OG1BO', 'owner',    'active'),
  (4, 'Adeeb',          'adeeb@foodadvisor.com',      '$2b$10$hTjq0F0mcaunrskqIwTBsOwT.moxyKuTbFWV6cphxuJW8/.5OG1BO', 'customer', 'active'),
  (5, 'Hasini',         'hasini@foodadvisor.com',     '$2b$10$hTjq0F0mcaunrskqIwTBsOwT.moxyKuTbFWV6cphxuJW8/.5OG1BO', 'customer', 'active'),
  (6, 'Samriddhi',      'samriddhi@foodadvisor.com',  '$2b$10$hTjq0F0mcaunrskqIwTBsOwT.moxyKuTbFWV6cphxuJW8/.5OG1BO', 'customer', 'active');

-- 2. Restaurants (owned by the two owners above)
INSERT INTO restaurants (id, owner_id, name, description, cuisine, city, address, price_range, image_url, is_approved) VALUES
  (1, 2, 'Saffron House', 'Warm, spice-forward Indian cooking in a relaxed dining room.', 'Indian',   'Springfield', '12 Curry Lane',     '$$', NULL, TRUE),
  (2, 3, 'Bella Pasta',   'Hand-rolled pasta and wood-fired pizzas from a family kitchen.', 'Italian',  'Springfield', '47 Olive Street',   '$$', NULL, TRUE),
  (3, 2, 'Green Bowl',    'Bright vegan bowls, smoothies and baked goods.',                'Vegan',    'Riverdale',   '8 Garden Road',     '$',  NULL, TRUE);

-- 3. Dishes
INSERT INTO dishes (restaurant_id, name, description, price, category, dietary_tag, image_url) VALUES
  (1, 'Butter Chicken',  'Tandoori chicken in a creamy tomato gravy.',          18.00, 'Main',     NULL,           NULL),
  (1, 'Garlic Naan',     'Flatbread brushed with garlic butter.',                4.00, 'Side',     NULL,           NULL),
  (1, 'Gulab Jamun',     'Warm milk dumplings in rose syrup.',                   6.00, 'Dessert',  'Vegetarian',   NULL),
  (2, 'Margherita Pizza','San Marzano tomato, mozzarella, basil.',              14.00, 'Main',     'Vegetarian',   NULL),
  (2, 'Bruschetta',      'Toasted ciabatta, tomato, olive oil, garlic.',         8.00, 'Appetizer','Vegan',        NULL),
  (2, 'Tiramisu',        'Espresso-soaked layers, mascarpone, cocoa.',           7.00, 'Dessert',  'Vegetarian',   NULL),
  (3, 'Buddha Bowl',     'Quinoa, roasted veg, chickpeas, tahini.',             11.00, 'Main',     'Vegan',        NULL),
  (3, 'Berry Smoothie',  'Mixed berries, banana, oat milk.',                     5.00, 'Beverage', 'Vegan',        NULL);

-- 4. Reviews (one per customer per restaurant - respects UNIQUE(customer_id, restaurant_id))
INSERT INTO reviews (restaurant_id, customer_id, rating, comment, status) VALUES
  (1, 4, 5, 'Best butter chicken in town, the naan is perfect.',                 'visible'),
  (1, 5, 4, 'Great food but the service was a little slow on a Friday night.',   'visible'),
  (2, 6, 5, 'Authentic pasta and a lovely warm ambiance.',                       'visible'),
  (2, 4, 3, 'Decent evening but my pizza was undercooked.',                      'visible'),
  (3, 5, 5, 'Fresh, healthy and fast - my go-to lunch spot.',                    'visible');

-- 5. Owner reply (Nathan replies to Adeeb's review on Saffron House)
INSERT INTO review_replies (review_id, owner_id, reply_text) VALUES
  (1, 2, 'Thank you Adeeb - so glad the butter chicken hit the spot!');
