-- Fayz Market V1 1.2.2 — product variants and characteristics, sale ("chegirma") prices, delivery tariff mode.
--
-- ADDITIVE for data: new table, new columns with defaults, new settings rows. Six stock/price triggers are
-- re-created (limited to rows without a variant) so that simple products behave exactly as before, and new
-- triggers enforce the same rules per variant. The 1.2.1 Worker keeps working on this schema (it never writes
-- variant_id, so every row it inserts takes the old path).
--
-- Stock model: a product WITH variants keeps its stock per variant (product_variants.stock). products.stock of
-- such a product is not used; the API reports the sum of its active variants.

PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN compare_price INTEGER NOT NULL DEFAULT 0 CHECK(compare_price >= 0);
-- JSON: [{"name":"Rang","values":["Qora","Oq"]}, ...] (variant axes, at most 3)
ALTER TABLE products ADD COLUMN options TEXT NOT NULL DEFAULT '[]';
-- JSON: [{"name":"Material","value":"Charm"}, ...] (characteristics shown on the product page)
ALTER TABLE products ADD COLUMN attributes TEXT NOT NULL DEFAULT '[]';

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- JSON object {"Rang":"Qora","Xotira":"128 GB"}; option_key is its normalised, ordered form (unique per product)
  options TEXT NOT NULL,
  option_key TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 0),
  compare_price INTEGER NOT NULL DEFAULT 0 CHECK(compare_price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, option_key)
);
CREATE INDEX idx_variants_product ON product_variants(product_id, active);

ALTER TABLE order_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id);
ALTER TABLE order_items ADD COLUMN variant_label TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_adjustments ADD COLUMN variant_id INTEGER REFERENCES product_variants(id);
-- Informational: what the customer saved against compare-at prices (the charged total never includes it twice).
ALTER TABLE orders ADD COLUMN discount_total INTEGER NOT NULL DEFAULT 0 CHECK(discount_total >= 0);
-- 1 = the shop has no fixed courier tariff; staff confirm the fee before the order is paid online.
ALTER TABLE orders ADD COLUMN delivery_fee_pending INTEGER NOT NULL DEFAULT 0 CHECK(delivery_fee_pending IN (0,1));

-- ---------- Simple products: unchanged rules, now limited to rows without a variant ----------
DROP TRIGGER IF EXISTS order_stock_check;
CREATE TRIGGER order_stock_check BEFORE INSERT ON order_items WHEN NEW.variant_id IS NULL BEGIN
  SELECT CASE WHEN (SELECT active FROM products WHERE id = NEW.product_id) != 1 OR (SELECT stock FROM products WHERE id = NEW.product_id) < NEW.quantity THEN RAISE(ABORT, 'OUT_OF_STOCK') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM product_variants WHERE product_id = NEW.product_id AND active = 1) THEN RAISE(ABORT, 'VARIANT_REQUIRED') END;
END;
DROP TRIGGER IF EXISTS order_stock_decrement;
CREATE TRIGGER order_stock_decrement AFTER INSERT ON order_items WHEN NEW.variant_id IS NULL BEGIN
  UPDATE products SET stock = stock - NEW.quantity, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.product_id;
END;
DROP TRIGGER IF EXISTS order_item_price_check;
CREATE TRIGGER order_item_price_check BEFORE INSERT ON order_items WHEN NEW.variant_id IS NULL BEGIN
  SELECT CASE WHEN NEW.price != (SELECT price FROM products WHERE id=NEW.product_id) THEN RAISE(ABORT, 'PRICE_CHANGED') END;
END;
DROP TRIGGER IF EXISTS order_cancel_restore_stock;
CREATE TRIGGER order_cancel_restore_stock AFTER UPDATE OF status ON orders WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
  UPDATE products SET stock=stock+(SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id=NEW.id AND product_id=products.id AND variant_id IS NULL)
    WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id AND variant_id IS NULL);
  UPDATE product_variants SET stock=stock+(SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id=NEW.id AND variant_id=product_variants.id), updated_at=CURRENT_TIMESTAMP
    WHERE id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.id AND variant_id IS NOT NULL);
END;
DROP TRIGGER IF EXISTS inventory_adjustment_check;
CREATE TRIGGER inventory_adjustment_check BEFORE INSERT ON inventory_adjustments WHEN NEW.variant_id IS NULL BEGIN
  SELECT CASE WHEN (SELECT stock FROM products WHERE id=NEW.product_id)+NEW.delta<0 THEN RAISE(ABORT, 'STOCK_CONFLICT') END;
END;
DROP TRIGGER IF EXISTS inventory_adjustment_apply;
CREATE TRIGGER inventory_adjustment_apply AFTER INSERT ON inventory_adjustments WHEN NEW.variant_id IS NULL BEGIN
  UPDATE products SET stock=stock+NEW.delta,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.product_id;
END;

-- ---------- Variants: same guarantees per variant ----------
CREATE TRIGGER order_variant_check BEFORE INSERT ON order_items WHEN NEW.variant_id IS NOT NULL BEGIN
  SELECT CASE WHEN (SELECT product_id FROM product_variants WHERE id = NEW.variant_id) IS NOT NEW.product_id
    OR (SELECT active FROM products WHERE id = NEW.product_id) != 1
    OR (SELECT active FROM product_variants WHERE id = NEW.variant_id) != 1
    OR (SELECT stock FROM product_variants WHERE id = NEW.variant_id) < NEW.quantity THEN RAISE(ABORT, 'OUT_OF_STOCK') END;
  SELECT CASE WHEN NEW.price != (SELECT price FROM product_variants WHERE id = NEW.variant_id) THEN RAISE(ABORT, 'PRICE_CHANGED') END;
END;
CREATE TRIGGER order_variant_stock_decrement AFTER INSERT ON order_items WHEN NEW.variant_id IS NOT NULL BEGIN
  UPDATE product_variants SET stock = stock - NEW.quantity, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.variant_id;
END;
CREATE TRIGGER inventory_adjustment_variant_check BEFORE INSERT ON inventory_adjustments WHEN NEW.variant_id IS NOT NULL BEGIN
  SELECT CASE WHEN (SELECT product_id FROM product_variants WHERE id=NEW.variant_id) IS NOT NEW.product_id
    OR (SELECT stock FROM product_variants WHERE id=NEW.variant_id)+NEW.delta<0 THEN RAISE(ABORT, 'STOCK_CONFLICT') END;
END;
CREATE TRIGGER inventory_adjustment_variant_apply AFTER INSERT ON inventory_adjustments WHEN NEW.variant_id IS NOT NULL BEGIN
  UPDATE product_variants SET stock=stock+NEW.delta,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.variant_id;
END;

-- ---------- Delivery tariff ----------
-- 'fixed' = delivery_fee (free from delivery_free_from); 'free' = no courier fee; 'quote' = no tariff set yet:
-- the order is accepted, the fee is shown as "to be confirmed" and staff set it before any online payment.
INSERT OR IGNORE INTO settings(key,value)
  SELECT 'delivery_fee_mode', CASE WHEN COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='delivery_fee'),0) > 0 THEN 'fixed' ELSE 'quote' END;

-- Pickup is one of the two agreed checkout choices. Switch it on when the store address exists and the owner has
-- never saved the checkout settings (an explicit owner choice, recorded in audit_log, is left untouched).
UPDATE settings SET value='1'
  WHERE key='fulfillment_pickup' AND value='0'
    AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action='payment.settings')
    AND COALESCE((SELECT length(trim(value)) FROM settings WHERE key='store_address'),0) >= 5;
