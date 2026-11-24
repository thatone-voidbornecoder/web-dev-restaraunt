CREATE DATABASE IF NOT EXISTS food_review_app;
USE food_review_app;

-- 1. All actors (Customers, Restaurant Owners, Administrators)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'owner', 'admin') NOT NULL DEFAULT 'customer',
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Restaurants (owned by a user with role = 'owner')
CREATE TABLE restaurants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  cuisine VARCHAR(80),
  city VARCHAR(80),
  address VARCHAR(255),
  price_range ENUM('$', '$$', '$$$', '$$$$') DEFAULT '$$',
  image_url VARCHAR(500),
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_search (cuisine, city, price_range)
);

-- 3. Dishes (belong to a restaurant)
CREATE TABLE dishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price DECIMAL(8, 2) NOT NULL,
  category VARCHAR(80), -- e.g., Appetizer, Main, Dessert
  dietary_tag VARCHAR(50), -- e.g., Vegan, Halal, Gluten-Free
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- 4. Ratings & Reviews (left by customers on a restaurant)
CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  customer_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status ENUM('visible', 'hidden', 'flagged') NOT NULL DEFAULT 'visible',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  -- Optional: prevents a customer from spamming multiple reviews on the same restaurant
  UNIQUE KEY unique_customer_restaurant (customer_id, restaurant_id)
);

-- 5. Owner Replies (one reply per review)
CREATE TABLE review_replies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL UNIQUE,
  owner_id INT NOT NULL,
  reply_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);