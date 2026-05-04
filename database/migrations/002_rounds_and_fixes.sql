USE fullgas_db;

CREATE TABLE sub_orders (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED NOT NULL,
  round_number SMALLINT UNSIGNED NOT NULL,
  label        VARCHAR(80) NULL,
  subtotal     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_paid   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_due  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status       ENUM('pending', 'partial', 'paid') NOT NULL DEFAULT 'pending',
  created_by   INT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at    DATETIME NULL,
  CONSTRAINT fk_sub_orders_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_orders_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_sub_orders_order_round (order_id, round_number),
  KEY idx_sub_orders_order (order_id),
  KEY idx_sub_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_items
  ADD COLUMN sub_order_id INT UNSIGNED NULL AFTER order_id,
  ADD CONSTRAINT fk_order_items_sub_order FOREIGN KEY (sub_order_id) REFERENCES sub_orders(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD COLUMN sub_order_id INT UNSIGNED NULL AFTER order_id,
  ADD COLUMN tendered_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER amount,
  ADD COLUMN change_given DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tendered_amount,
  ADD CONSTRAINT fk_payments_sub_order FOREIGN KEY (sub_order_id) REFERENCES sub_orders(id) ON DELETE SET NULL;

ALTER TABLE inventory_movements
  ADD COLUMN admin_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER performed_by,
  ADD COLUMN verified_by INT UNSIGNED NULL AFTER admin_verified,
  ADD CONSTRAINT fk_inventory_movements_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_logs
  ADD COLUMN entity_type VARCHAR(80) NULL AFTER module,
  ADD COLUMN entity_id VARCHAR(60) NULL AFTER entity_type,
  ADD COLUMN details_json JSON NULL AFTER description;

INSERT INTO sub_orders (order_id, round_number, label, subtotal, total_paid, balance_due, status, created_by, created_at)
SELECT o.id,
       1,
       'Tanda 1',
       o.subtotal,
       0,
       o.subtotal,
       CASE WHEN o.subtotal > 0 THEN 'pending' ELSE 'paid' END,
       o.waiter_id,
       o.opened_at
FROM orders o;

UPDATE order_items oi
JOIN sub_orders so ON so.order_id = oi.order_id AND so.round_number = 1
SET oi.sub_order_id = so.id;

UPDATE payments p
JOIN (
  SELECT so.id, so.order_id
  FROM sub_orders so
  WHERE so.round_number = 1
) so ON so.order_id = p.order_id
SET p.sub_order_id = so.id,
    p.tendered_amount = p.amount;

UPDATE sub_orders so
LEFT JOIN (
  SELECT sub_order_id, COALESCE(SUM(subtotal), 0) AS subtotal
  FROM order_items
  WHERE status = 'active'
  GROUP BY sub_order_id
) items ON items.sub_order_id = so.id
LEFT JOIN (
  SELECT sub_order_id, COALESCE(SUM(amount), 0) AS total_paid
  FROM payments
  WHERE sub_order_id IS NOT NULL
  GROUP BY sub_order_id
) pay ON pay.sub_order_id = so.id
SET so.subtotal = COALESCE(items.subtotal, 0),
    so.total_paid = COALESCE(pay.total_paid, 0),
    so.balance_due = GREATEST(0, COALESCE(items.subtotal, 0) - COALESCE(pay.total_paid, 0)),
    so.status = CASE
      WHEN GREATEST(0, COALESCE(items.subtotal, 0) - COALESCE(pay.total_paid, 0)) = 0 THEN 'paid'
      WHEN COALESCE(pay.total_paid, 0) > 0 THEN 'partial'
      ELSE 'pending'
    END,
    so.closed_at = CASE
      WHEN GREATEST(0, COALESCE(items.subtotal, 0) - COALESCE(pay.total_paid, 0)) = 0 THEN NOW()
      ELSE NULL
    END;

UPDATE orders o
LEFT JOIN (
  SELECT order_id, COALESCE(SUM(subtotal), 0) AS subtotal
  FROM sub_orders
  GROUP BY order_id
) subt ON subt.order_id = o.id
LEFT JOIN (
  SELECT order_id, COALESCE(SUM(amount), 0) AS total_paid
  FROM payments
  GROUP BY order_id
) pay ON pay.order_id = o.id
SET o.subtotal = COALESCE(subt.subtotal, 0),
    o.total_paid = COALESCE(pay.total_paid, 0),
    o.service_charge = CASE WHEN o.service_accepted = 1 THEN ROUND(COALESCE(subt.subtotal, 0) * 0.05) ELSE 0 END,
    o.total = COALESCE(subt.subtotal, 0) + CASE WHEN o.service_accepted = 1 THEN ROUND(COALESCE(subt.subtotal, 0) * 0.05) ELSE 0 END,
    o.balance_due = GREATEST(
      0,
      COALESCE(subt.subtotal, 0) + CASE WHEN o.service_accepted = 1 THEN ROUND(COALESCE(subt.subtotal, 0) * 0.05) ELSE 0 END - COALESCE(pay.total_paid, 0)
    );

INSERT IGNORE INTO payment_methods (name, code, sort_order) VALUES
  ('Nequi', 'nequi', 3),
  ('Daviplata', 'daviplata', 4),
  ('Tarjeta', 'card', 5);

UPDATE payment_methods SET sort_order = 1 WHERE code = 'cash';
UPDATE payment_methods SET sort_order = 2 WHERE code IN ('transfer', 'nequi', 'daviplata');
UPDATE payment_methods SET sort_order = 5 WHERE code IN ('debit', 'credit', 'card');
