-- =============================================
-- Migration 008: Módulo de caja - historial, movimientos manuales, permisos
-- Idempotente sobre esquemas existentes
-- =============================================

USE fullgas_db;

-- =============================================
-- MOVIMIENTOS MANUALES DE CAJA
-- Para registrar ingresos/egresos no vinculados a ventas ni gastos
-- =============================================

CREATE TABLE IF NOT EXISTS cash_movements (
  id              INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  cash_session_id INT UNSIGNED   NOT NULL,
  type            ENUM('in','out') NOT NULL,
  concept         VARCHAR(100)   NOT NULL,
  amount          DECIMAL(12,2)  NOT NULL,
  description     VARCHAR(255)   NULL,
  registered_by   INT UNSIGNED   NOT NULL,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (registered_by)   REFERENCES users(id)         ON DELETE RESTRICT,
  INDEX idx_cash_movements_session (cash_session_id),
  INDEX idx_cash_movements_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- RUTA DEL PDF DE CIERRE en cash_sessions
-- =============================================

SET @has_pdf_path = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'cash_sessions'
    AND column_name  = 'pdf_path'
);
SET @sql = IF(
  @has_pdf_path = 0,
  'ALTER TABLE cash_sessions ADD COLUMN pdf_path VARCHAR(500) NULL AFTER notes',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================
-- PERMISOS DE CAJA
-- =============================================

INSERT INTO permissions (name, module, description)
SELECT 'cash.manage', 'cash', 'Apertura y cierre de sesiones de caja'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'cash.manage');

INSERT INTO permissions (name, module, description)
SELECT 'cash.view', 'cash', 'Ver historial y resúmenes de caja'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'cash.view');

INSERT INTO permissions (name, module, description)
SELECT 'cash.movements', 'cash', 'Registrar movimientos manuales de caja'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'cash.movements');

-- Asignar todos los permisos de caja al admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('cash.manage', 'cash.view', 'cash.movements')
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.name = 'admin'
  AND rp.role_id IS NULL;

-- El mesero solo puede ver el estado
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name = 'cash.view'
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.name = 'mesero'
  AND rp.role_id IS NULL;

-- Developer igual que admin para herramientas
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('cash.manage', 'cash.view', 'cash.movements')
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.name = 'developer'
  AND rp.role_id IS NULL;
