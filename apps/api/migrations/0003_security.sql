CREATE TABLE login_attempts (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, first_attempt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER paid_order_cancel_check BEFORE UPDATE OF status ON orders WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM payments WHERE order_id=NEW.id) THEN RAISE(ABORT, 'PAID_ORDER') END;
END;
