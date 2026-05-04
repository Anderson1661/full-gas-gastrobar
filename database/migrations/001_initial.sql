-- =============================================
-- Full Gas Gastrobar - Schema inicial MySQL
-- Versión: 1.0.0
-- Convención: snake_case, plurales para tablas
-- Todas las tablas tienen: created_at, updated_at
-- Registros lógicos: is_active / status
-- =============================================

SET NAMES utf8mb4;
SET time_zone = '-05:00'; -- Colombia UTC-5
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================
-- ROLES Y PERMISOS
-- =============================================

CREATE TABLE IF NOT EXISTS roles (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL UNIQUE,  -- admin, mesero, developer
  description VARCHAR(255),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE, -- ej: orders.create, inventory.adjust
  module      VARCHAR(50)  NOT NULL,
  description VARCHAR(255),
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- USUARIOS
-- =============================================

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id       INT UNSIGNED NOT NULL,
  pin           VARCHAR(255),                  -- PIN opcional para operación rápida (hasheado)
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at DATETIME,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  INDEX idx_users_username (username),
  INDEX idx_users_role     (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- MESAS
-- =============================================

CREATE TABLE IF NOT EXISTS bar_tables (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  number      SMALLINT UNSIGNED NOT NULL UNIQUE, -- número de mesa
  name        VARCHAR(50),                        -- alias: "Terraza 1", "VIP", etc.
  capacity    TINYINT UNSIGNED  NOT NULL DEFAULT 4,
  zone        VARCHAR(50),                        -- zona: barra, terraza, salón, etc.
  position_x  SMALLINT UNSIGNED NOT NULL DEFAULT 0, -- posición en mapa visual (px)
  position_y  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status      ENUM('available','occupied','pending_payment','reserved','inactive')
				DEFAULT 'available',

  is_active   BOOLEAN           NOT NULL DEFAULT TRUE,
  created_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tables_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PROVEEDORES
-- =============================================

CREATE TABLE IF NOT EXISTS suppliers (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  contact    VARCHAR(100),
  phone      VARCHAR(20),
  email      VARCHAR(150),
  notes      TEXT,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PRODUCTOS Y CATEGORÍAS
-- =============================================

CREATE TABLE IF NOT EXISTS product_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL UNIQUE,  -- Cerveza, Licor, Cóctel, Madrugada, etc.
  description VARCHAR(255),
  color       VARCHAR(7),                     -- hex color para UI: #FF5733
  icon        VARCHAR(50),                    -- nombre de ícono lucide
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active   BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id               INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  category_id      INT UNSIGNED    NOT NULL,
  supplier_id      INT UNSIGNED,
  sku              VARCHAR(50)     UNIQUE,           -- código interno opcional
  name             VARCHAR(100)    NOT NULL,
  description      VARCHAR(255),
  cost_price       DECIMAL(12,2)   NOT NULL DEFAULT 0.00, -- precio de costo
  sale_price       DECIMAL(12,2)   NOT NULL,              -- precio de venta
  stock            DECIMAL(10,3)   NOT NULL DEFAULT 0,    -- permite medios: 0.5 L
  min_stock        DECIMAL(10,3)   NOT NULL DEFAULT 0,    -- alerta de stock mínimo
  unit             VARCHAR(20)     NOT NULL DEFAULT 'und', -- und, ml, l, kg, g
  track_inventory  BOOLEAN         NOT NULL DEFAULT TRUE,  -- algunos no descuentan stock
  is_active        BOOLEAN         NOT NULL DEFAULT TRUE,
  image_path       VARCHAR(255),
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  INDEX idx_products_category  (category_id),
  INDEX idx_products_is_active (is_active),
  INDEX idx_products_name      (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PROMOCIONES
-- =============================================

CREATE TABLE IF NOT EXISTS promotions (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  description     VARCHAR(255),
  type            ENUM('percentage','fixed_amount','fixed_price','combo','happy_hour')
                  NOT NULL,
  discount_value  DECIMAL(10,2) NOT NULL DEFAULT 0,  -- % o valor según tipo
  min_quantity    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  applies_to      ENUM('product','category','order') NOT NULL DEFAULT 'product',
  start_time      TIME,                               -- hora inicio (happy hour)
  end_time        TIME,                               -- hora fin
  days_of_week    VARCHAR(20),                        -- "1,2,3,4,5" (lun-vie)
  valid_from      DATE,
  valid_until     DATE,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by      INT UNSIGNED  NOT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_promotions_active (is_active),
  INDEX idx_promotions_dates  (valid_from, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotion_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  promotion_id INT UNSIGNED NOT NULL,
  product_id   INT UNSIGNED,                     -- NULL si aplica por categoría
  category_id  INT UNSIGNED,
  FOREIGN KEY (promotion_id) REFERENCES promotions(id)          ON DELETE CASCADE,
  FOREIGN KEY (product_id)   REFERENCES products(id)            ON DELETE CASCADE,
  FOREIGN KEY (category_id)  REFERENCES product_categories(id)  ON DELETE CASCADE,
  INDEX idx_promo_items_promotion (promotion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- MÉTODOS DE PAGO
-- =============================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(50)  NOT NULL UNIQUE,  -- Efectivo, Transferencia, Tarjeta Débito, etc.
  code       VARCHAR(20)  NOT NULL UNIQUE,  -- cash, transfer, debit, credit, other
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SESIONES DE CAJA
-- =============================================

CREATE TABLE IF NOT EXISTS cash_sessions (
  id                  INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  opened_by           INT UNSIGNED  NOT NULL,
  closed_by           INT UNSIGNED,
  opening_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- base de caja
  closing_amount_real DECIMAL(12,2),                       -- conteo real al cierre
  status              ENUM('open','closed') NOT NULL DEFAULT 'open',
  notes               TEXT,
  opened_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at           DATETIME,
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_cash_sessions_status (status),
  INDEX idx_cash_sessions_opened (opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ÓRDENES (apertura de mesa)
-- =============================================

CREATE TABLE IF NOT EXISTS orders (
  id               INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  table_id         INT UNSIGNED  NOT NULL,
  waiter_id        INT UNSIGNED  NOT NULL,   -- mesero responsable
  cash_session_id  INT UNSIGNED,             -- sesión de caja asociada
  status           ENUM('open','pending_payment','paid','cancelled')
                   NOT NULL DEFAULT 'open',
  subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  service_charge   DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- 5% si aplica
  service_accepted BOOLEAN,                               -- null = no ofrecido aún
  total            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_paid       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_due      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes            TEXT,
  opened_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at        DATETIME,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (table_id)        REFERENCES bar_tables(id)    ON DELETE RESTRICT,
  FOREIGN KEY (waiter_id)       REFERENCES users(id)          ON DELETE RESTRICT,
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id)  ON DELETE SET NULL,
  INDEX idx_orders_table   (table_id),
  INDEX idx_orders_waiter  (waiter_id),
  INDEX idx_orders_status  (status),
  INDEX idx_orders_opened  (opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ÍTEMS DE ORDEN
-- =============================================

CREATE TABLE IF NOT EXISTS order_items (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  order_id        INT UNSIGNED  NOT NULL,
  product_id      INT UNSIGNED  NOT NULL,
  promotion_id    INT UNSIGNED,                           -- si aplica promoción
  quantity        DECIMAL(8,3)  NOT NULL,
  unit_price      DECIMAL(12,2) NOT NULL,                 -- precio al momento del pedido
  original_price  DECIMAL(12,2) NOT NULL,                 -- precio sin promo
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  subtotal        DECIMAL(12,2) NOT NULL,
  notes           VARCHAR(255),                           -- instrucción especial
  status          ENUM('active','cancelled','modified') NOT NULL DEFAULT 'active',
  sent_to_bar     BOOLEAN      NOT NULL DEFAULT FALSE,    -- si fue enviado a barra
  sent_at         DATETIME,
  cancelled_by    INT UNSIGNED,
  cancel_reason   VARCHAR(255),
  created_by      INT UNSIGNED  NOT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)     REFERENCES orders(id)      ON DELETE RESTRICT,
  FOREIGN KEY (product_id)   REFERENCES products(id)    ON DELETE RESTRICT,
  FOREIGN KEY (promotion_id) REFERENCES promotions(id)  ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by) REFERENCES users(id)       ON DELETE SET NULL,
  FOREIGN KEY (created_by)   REFERENCES users(id)       ON DELETE RESTRICT,
  INDEX idx_order_items_order   (order_id),
  INDEX idx_order_items_product (product_id),
  INDEX idx_order_items_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PAGOS
-- =============================================

CREATE TABLE IF NOT EXISTS payments (
  id                INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  order_id          INT UNSIGNED  NOT NULL,
  payment_method_id INT UNSIGNED  NOT NULL,
  amount            DECIMAL(12,2) NOT NULL,
  reference         VARCHAR(100),   -- número de transferencia, comprobante, etc.
  received_by       INT UNSIGNED  NOT NULL,  -- usuario que recibió el pago
  notes             VARCHAR(255),
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)          REFERENCES orders(id)          ON DELETE RESTRICT,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT,
  FOREIGN KEY (received_by)       REFERENCES users(id)           ON DELETE RESTRICT,
  INDEX idx_payments_order  (order_id),
  INDEX idx_payments_method (payment_method_id),
  INDEX idx_payments_date   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- COMPROBANTES INTERNOS
-- =============================================

CREATE TABLE IF NOT EXISTS receipts (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  receipt_number  VARCHAR(20)   NOT NULL UNIQUE,  -- FG-00001
  order_id        INT UNSIGNED  NOT NULL UNIQUE,
  subtotal        DECIMAL(12,2) NOT NULL,
  service_charge  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total           DECIMAL(12,2) NOT NULL,
  total_paid      DECIMAL(12,2) NOT NULL,
  change_given    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  issued_by       INT UNSIGNED  NOT NULL,
  issued_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_at      DATETIME,
  voided          BOOLEAN       NOT NULL DEFAULT FALSE,
  void_reason     VARCHAR(255),
  voided_by       INT UNSIGNED,
  voided_at       DATETIME,
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (issued_by)  REFERENCES users(id)  ON DELETE RESTRICT,
  FOREIGN KEY (voided_by)  REFERENCES users(id)  ON DELETE SET NULL,
  INDEX idx_receipts_number (receipt_number),
  INDEX idx_receipts_issued (issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Secuencia para receipt_number
CREATE TABLE IF NOT EXISTS receipt_sequence (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prefix         VARCHAR(5)   NOT NULL DEFAULT 'FG',
  last_number    INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- INVENTARIO - MOVIMIENTOS (KARDEX)
-- =============================================

CREATE TABLE IF NOT EXISTS inventory_movements (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  product_id   INT UNSIGNED  NOT NULL,
  type         ENUM('purchase','sale','adjustment_in','adjustment_out','waste','return')
               NOT NULL,
  quantity     DECIMAL(10,3) NOT NULL,        -- siempre positivo, tipo indica dirección
  unit_cost    DECIMAL(12,2),                 -- costo unitario del movimiento
  stock_before DECIMAL(10,3) NOT NULL,
  stock_after  DECIMAL(10,3) NOT NULL,
  reference_id INT UNSIGNED,                  -- order_id, expense_id, etc.
  reference_type VARCHAR(50),                 -- 'order','expense','manual', etc.
  reason       VARCHAR(255),
  performed_by INT UNSIGNED  NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id)   REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (performed_by) REFERENCES users(id)    ON DELETE RESTRICT,
  INDEX idx_inv_mov_product (product_id),
  INDEX idx_inv_mov_type    (type),
  INDEX idx_inv_mov_date    (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- GASTOS OPERATIVOS
-- =============================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL UNIQUE,
  description VARCHAR(255),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  category_id   INT UNSIGNED  NOT NULL,
  cash_session_id INT UNSIGNED,
  description   VARCHAR(255)  NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  receipt_image VARCHAR(255),               -- ruta a imagen de soporte opcional
  notes         TEXT,
  registered_by INT UNSIGNED  NOT NULL,
  expense_date  DATE          NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id)     REFERENCES expense_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id)      ON DELETE SET NULL,
  FOREIGN KEY (registered_by)   REFERENCES users(id)              ON DELETE RESTRICT,
  INDEX idx_expenses_category (category_id),
  INDEX idx_expenses_date     (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CIERRE DE CAJA (detalle por método de pago)
-- =============================================

CREATE TABLE IF NOT EXISTS cash_closure_details (
  id                INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  cash_session_id   INT UNSIGNED  NOT NULL,
  payment_method_id INT UNSIGNED  NOT NULL,
  theoretical_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- lo que dice el sistema
  real_amount        DECIMAL(12,2),                        -- conteo manual
  difference         DECIMAL(12,2),                        -- real - teórico
  notes              VARCHAR(255),
  FOREIGN KEY (cash_session_id)   REFERENCES cash_sessions(id)    ON DELETE CASCADE,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)  ON DELETE RESTRICT,
  INDEX idx_closure_detail_session (cash_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CONFIGURACIÓN DEL SISTEMA
-- =============================================

CREATE TABLE IF NOT EXISTS system_settings (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_name    VARCHAR(100) NOT NULL UNIQUE,
  value       TEXT         NOT NULL,
  description VARCHAR(255),
  updated_by  INT UNSIGNED,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- AUDITORÍA
-- =============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  username      VARCHAR(50)  NOT NULL,   -- desnormalizado para historial permanente
  action        VARCHAR(50)  NOT NULL,   -- CREATE, UPDATE, DELETE, CANCEL, CLOSE, ADJUST
  module        VARCHAR(50)  NOT NULL,   -- orders, inventory, payments, users, etc.
  record_id     VARCHAR(50),             -- ID del registro afectado
  description   TEXT,
  old_values    JSON,                    -- estado anterior (para ediciones)
  new_values    JSON,                    -- estado nuevo
  ip_address    VARCHAR(45),
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_audit_user   (user_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_module (module),
  INDEX idx_audit_date   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
