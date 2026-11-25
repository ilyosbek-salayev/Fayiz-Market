-- Fayz Market V1 storefront: brand, store location, banners, checkout payment/fulfillment, online-payment
-- transactions and encrypted integration credentials.
--
-- ADDITIVE ONLY. New tables, new columns with defaults, new settings rows (INSERT OR IGNORE keeps any value an
-- owner already set), new triggers, and one back-fill of the new orders.payment_status column from the existing
-- payments ledger. No table is dropped or rebuilt; no existing row loses data.
-- Rollback without data loss: the old Worker ignores every object created here, so redeploying the previous
-- Worker version is enough (the extra columns/tables simply stay unused).

-- ---------- Public brand / store / checkout settings (served by GET /settings and GET /storefront) ----------
INSERT OR IGNORE INTO settings(key,value) VALUES
  ('brand_tagline','Aksessuarlar doʻkoni'), ('brand_logo_light',''), ('brand_logo_dark',''),
  ('store_place_name',''),
  ('payment_cash','1'), ('payment_card_terminal','0'), ('payment_bank_transfer','0'), ('bank_transfer_details',''),
  ('fulfillment_pickup','0'),
  ('payme_enabled','0'), ('payme_merchant_id',''), ('payme_mode','test'),
  ('click_enabled','0'), ('click_service_id',''), ('click_merchant_id',''), ('click_merchant_user_id','');

-- Previous logos, so an owner can return to an earlier approved logo. '' means "the logo built into the app".
CREATE TABLE brand_logo_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, variant TEXT NOT NULL CHECK(variant IN ('light','dark')), url TEXT NOT NULL,
  replaced_by INTEGER REFERENCES admins(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_brand_logo_history ON brand_logo_history(variant, id);

-- ---------- Home-screen banners (images in R2, rows here) ----------
CREATE TABLE banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT '', cta_target TEXT NOT NULL DEFAULT 'none',
  image_url TEXT NOT NULL DEFAULT '', tone TEXT NOT NULL DEFAULT 'accent' CHECK(tone IN ('accent','dark','light')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), position INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES admins(id), updated_by INTEGER REFERENCES admins(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_banners_live ON banners(active, position, id);

-- ---------- Orders: how the goods reach the customer and how they pay ----------
ALTER TABLE orders ADD COLUMN fulfillment TEXT NOT NULL DEFAULT 'delivery' CHECK(fulfillment IN ('delivery','pickup'));
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash','card_terminal','bank_transfer','payme','click'));
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','verifying','paid','failed','cancelled','refunded'));
ALTER TABLE orders ADD COLUMN paid_at TEXT;
ALTER TABLE orders ADD COLUMN payment_note TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_orders_payment ON orders(payment_status, id);

-- Online provider transactions (Payme / Click). Money confirmed by a provider lives here; money an employee
-- received by hand stays in `payments`. UNIQUE(provider, provider_txn_id) makes every provider callback idempotent,
-- and at most one live (created or performed) transaction may exist per order.
CREATE TABLE payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL CHECK(provider IN ('payme','click')),
  provider_txn_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  state TEXT NOT NULL CHECK(state IN ('created','performed','cancelled','refunded')),
  provider_time INTEGER, created_ms INTEGER NOT NULL, performed_ms INTEGER, cancelled_ms INTEGER, cancel_reason INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  UNIQUE(provider, provider_txn_id)
);
CREATE UNIQUE INDEX idx_payment_txn_live ON payment_transactions(order_id) WHERE state IN ('created','performed');
CREATE INDEX idx_payment_txn_time ON payment_transactions(provider, created_ms);

-- Back-fill: orders whose recorded payments already cover the total are paid; cancelled unpaid orders are cancelled.
UPDATE orders SET payment_status='paid', paid_at=(SELECT MAX(created_at) FROM payments WHERE order_id=orders.id)
  WHERE total > 0 AND (SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=orders.id) >= total;
UPDATE orders SET payment_status='cancelled' WHERE status='cancelled' AND payment_status='pending';

-- Payment status may only move along these edges, and only once (a second, stale change matches no row).
CREATE TRIGGER order_payment_transition BEFORE UPDATE OF payment_status ON orders WHEN OLD.payment_status != NEW.payment_status BEGIN
  SELECT CASE WHEN NOT (
    (OLD.payment_status IN ('pending','failed') AND NEW.payment_status IN ('pending','verifying','paid','failed','cancelled')) OR
    (OLD.payment_status='verifying' AND NEW.payment_status IN ('pending','paid','failed','cancelled')) OR
    (OLD.payment_status='paid' AND NEW.payment_status='refunded')
  ) THEN RAISE(ABORT, 'INVALID_PAYMENT_TRANSITION') END;
END;
-- "Paid" is never just a label: the money must already be in the ledger or confirmed by a provider.
CREATE TRIGGER order_paid_requires_money BEFORE UPDATE OF payment_status ON orders WHEN NEW.payment_status='paid' AND OLD.payment_status!='paid' BEGIN
  SELECT CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=NEW.id)
    + (SELECT COALESCE(SUM(amount),0) FROM payment_transactions WHERE order_id=NEW.id AND state='performed') < NEW.total
  THEN RAISE(ABORT, 'PAYMENT_NOT_RECEIVED') END;
END;
-- A paid or refunded order takes no further manual payment rows.
CREATE TRIGGER payment_closed_check BEFORE INSERT ON payments BEGIN
  SELECT CASE WHEN (SELECT payment_status FROM orders WHERE id=NEW.order_id) IN ('paid','refunded') THEN RAISE(ABORT, 'ALREADY_PAID') END;
  SELECT CASE WHEN NEW.reference != '' AND NEW.method IN ('bank_transfer','card_terminal')
    AND EXISTS(SELECT 1 FROM payments WHERE method=NEW.method AND reference=NEW.reference) THEN RAISE(ABORT, 'DUPLICATE_PAYMENT') END;
END;
-- An order paid online cannot be cancelled either (same rule as the manual ledger).
CREATE TRIGGER paid_online_order_cancel_check BEFORE UPDATE OF status ON orders WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM payment_transactions WHERE order_id=NEW.id AND state='performed') THEN RAISE(ABORT, 'PAID_ORDER') END;
END;
-- A provider can perform only the exact order total, and only on an order that is not cancelled or already paid.
CREATE TRIGGER payment_txn_perform_check BEFORE UPDATE OF state ON payment_transactions WHEN NEW.state='performed' AND OLD.state!='performed' BEGIN
  SELECT CASE WHEN OLD.state != 'created' THEN RAISE(ABORT, 'INVALID_TXN_STATE') END;
  SELECT CASE WHEN (SELECT status FROM orders WHERE id=NEW.order_id)='cancelled' THEN RAISE(ABORT, 'CANCELLED_ORDER') END;
  SELECT CASE WHEN (SELECT payment_status FROM orders WHERE id=NEW.order_id) IN ('paid','refunded','cancelled') THEN RAISE(ABORT, 'ALREADY_PAID') END;
  SELECT CASE WHEN NEW.amount != (SELECT total FROM orders WHERE id=NEW.order_id) THEN RAISE(ABORT, 'AMOUNT_MISMATCH') END;
END;

-- ---------- Integration credentials entered in Admin → Integratsiyalar ----------
-- AES-256-GCM ciphertext only. The key is the Cloudflare secret INTEGRATIONS_MASTER_KEY, which is never stored in
-- D1; `key_id` (a hash prefix of that key) shows whether a value was sealed with the current key.
CREATE TABLE integration_secrets (
  name TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, key_id TEXT NOT NULL,
  updated_by INTEGER REFERENCES admins(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
