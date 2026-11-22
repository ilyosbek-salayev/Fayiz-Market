-- V1 expansion: customer accounts, courier role, delivery lifecycle, tracking, notifications, reviews, audit.
-- Everything is additive except `admins`, which is rebuilt only to widen its role CHECK with 'courier'
-- (SQLite cannot alter a CHECK constraint). Every admin row is copied 1:1 with its id and password hash,
-- and login sessions are kept, so existing accounts, payments and inventory references stay valid.
PRAGMA defer_foreign_keys = on;
CREATE TABLE sessions_keep AS SELECT * FROM sessions;
CREATE TABLE admins_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','courier')),
  name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO admins_new(id,email,password_hash,role,created_at) SELECT id,email,password_hash,role,created_at FROM admins;
DROP TABLE admins;
ALTER TABLE admins_new RENAME TO admins;
INSERT OR IGNORE INTO sessions SELECT * FROM sessions_keep;
DROP TABLE sessions_keep;
PRAGMA defer_foreign_keys = off;

-- Customer accounts (phone + password, Telegram) and their sessions.
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, phone_verified_at TEXT, name TEXT NOT NULL DEFAULT '',
  password_hash TEXT, telegram_id TEXT UNIQUE, telegram_username TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE customer_sessions (token_hash TEXT PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_customer_sessions_customer ON customer_sessions(customer_id);
CREATE TABLE otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('register','reset','link')),
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_otp_phone ON otp_codes(phone, purpose, id);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_start TEXT NOT NULL, count INTEGER NOT NULL);
CREATE TABLE telegram_auth_replays (hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);

-- Orders: optional customer link and map location (existing rows keep NULL / '').
ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id);
ALTER TABLE orders ADD COLUMN delivery_lat REAL;
ALTER TABLE orders ADD COLUMN delivery_lng REAL;
ALTER TABLE orders ADD COLUMN delivery_details TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_orders_customer ON orders(customer_id, id);

-- Courier delivery lifecycle (one active record per order) and its latest position.
CREATE TABLE deliveries (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id), courier_id INTEGER NOT NULL REFERENCES admins(id),
  status TEXT NOT NULL CHECK(status IN ('assigned','accepted','declined','picked_up','on_the_way','arrived','handed_over','confirmed','disputed','resolved','cancelled')),
  version INTEGER NOT NULL DEFAULT 1, assigned_by INTEGER REFERENCES admins(id), decline_reason TEXT NOT NULL DEFAULT '',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, accepted_at TEXT, picked_up_at TEXT, arrived_at TEXT,
  handed_over_at TEXT, confirmed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_deliveries_courier ON deliveries(courier_id, status);
-- Only the latest point of an active delivery is kept; it is deleted when the delivery ends.
CREATE TABLE delivery_locations (order_id INTEGER PRIMARY KEY REFERENCES orders(id), courier_id INTEGER NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL, recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Audit trails.
CREATE TABLE order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), actor_type TEXT NOT NULL, actor_id INTEGER, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_order_events_order ON order_events(order_id, id);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Staff/courier notification feed (polled by the apps) and push registrations (FCM, when configured).
CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, audience TEXT NOT NULL CHECK(audience IN ('staff','courier')), recipient_id INTEGER, order_id INTEGER, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_notifications_audience ON notifications(audience, recipient_id, id);
CREATE TABLE push_tokens (token TEXT PRIMARY KEY, platform TEXT NOT NULL, audience TEXT NOT NULL CHECK(audience IN ('staff','courier','customer')), principal_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, failures INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_push_tokens_principal ON push_tokens(audience, principal_id);

-- Verified-purchase reviews (unlocked only after delivery confirmation) and courier ratings.
CREATE TABLE product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id), author_name TEXT NOT NULL DEFAULT '', rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_id, product_id)
);
CREATE INDEX idx_reviews_product ON product_reviews(product_id, status, id);
CREATE TABLE courier_ratings (order_id INTEGER PRIMARY KEY REFERENCES orders(id), courier_id INTEGER NOT NULL REFERENCES admins(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Public, non-secret store/integration settings (secrets live in Cloudflare secrets, never here).
INSERT OR IGNORE INTO settings(key,value) VALUES ('store_address',''),('store_lat',''),('store_lng',''),('google_maps_key',''),('telegram_bot_username','');
