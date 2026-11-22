CREATE TRIGGER order_item_price_check BEFORE INSERT ON order_items BEGIN
  SELECT CASE WHEN NEW.price != (SELECT price FROM products WHERE id=NEW.product_id) THEN RAISE(ABORT, 'PRICE_CHANGED') END;
END;
CREATE TRIGGER order_status_transition BEFORE UPDATE OF status ON orders WHEN OLD.status != NEW.status BEGIN
  SELECT CASE WHEN NOT (
    (OLD.status='new' AND NEW.status IN ('confirmed','cancelled')) OR
    (OLD.status='confirmed' AND NEW.status IN ('preparing','cancelled')) OR
    (OLD.status='preparing' AND NEW.status IN ('shipped','cancelled')) OR
    (OLD.status='shipped' AND NEW.status='delivered')
  ) THEN RAISE(ABORT, 'INVALID_TRANSITION') END;
END;
CREATE TRIGGER order_cancel_restore_stock AFTER UPDATE OF status ON orders WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
  UPDATE products SET stock=stock+(SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id=NEW.id AND product_id=products.id) WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
END;
CREATE TRIGGER inventory_adjustment_check BEFORE INSERT ON inventory_adjustments BEGIN
  SELECT CASE WHEN (SELECT stock FROM products WHERE id=NEW.product_id)+NEW.delta<0 THEN RAISE(ABORT, 'STOCK_CONFLICT') END;
END;
CREATE TRIGGER inventory_adjustment_apply AFTER INSERT ON inventory_adjustments BEGIN
  UPDATE products SET stock=stock+NEW.delta,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.product_id;
END;
CREATE TRIGGER payment_check BEFORE INSERT ON payments BEGIN
  SELECT CASE WHEN (SELECT status FROM orders WHERE id=NEW.order_id)='cancelled' THEN RAISE(ABORT, 'CANCELLED_ORDER') END;
  SELECT CASE WHEN NEW.amount+(SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=NEW.order_id)>(SELECT total FROM orders WHERE id=NEW.order_id) THEN RAISE(ABORT, 'OVERPAYMENT') END;
END;
