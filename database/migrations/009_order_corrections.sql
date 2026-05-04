-- Tabla para registrar correcciones sobre cuentas cerradas
CREATE TABLE IF NOT EXISTS order_corrections (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT NOT NULL,
  type         ENUM('refund', 'note') NOT NULL DEFAULT 'note',
  amount       DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  reason       TEXT NOT NULL,
  created_by   INT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_corrections_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
