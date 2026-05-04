-- =============================================
-- Migracion 003: sesiones, seguridad, auditoria avanzada, promociones
-- Idempotente sobre esquemas creados desde 001_initial.sql
-- =============================================

USE fullgas_db;

-- =============================================
-- SESIONES DE USUARIO
-- =============================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  device_info   VARCHAR(255),
  ip_address    VARCHAR(45),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME NOT NULL,
  last_used_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at    DATETIME,
  revoke_reason VARCHAR(100),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_token (session_token),
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_active (is_active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PREGUNTAS DE SEGURIDAD
-- =============================================

CREATE TABLE IF NOT EXISTS security_questions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question   VARCHAR(255) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO security_questions (id, question, sort_order) VALUES
  (1,  'Cual es el nombre de tu primera mascota?', 1),
  (2,  'En que ciudad naciste?', 2),
  (3,  'Cual es el nombre de soltera de tu madre?', 3),
  (4,  'Cual fue el nombre de tu primera escuela?', 4),
  (5,  'Cual es el nombre de tu mejor amigo de infancia?', 5),
  (6,  'Cual era la marca de tu primer coche?', 6),
  (7,  'Cual es tu pelicula favorita de la infancia?', 7),
  (8,  'Cual es el apellido de tu profesor favorito?', 8),
  (9,  'En que calle creciste?', 9),
  (10, 'Cual es el segundo nombre de tu padre?', 10);

-- =============================================
-- RESPUESTAS DE SEGURIDAD DE USUARIOS
-- =============================================

CREATE TABLE IF NOT EXISTS user_security_answers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  answer_hash VARCHAR(255) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_question (user_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES security_questions(id) ON DELETE RESTRICT,
  INDEX idx_answers_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- INTENTOS DE RECUPERACION DE CONTRASENA
-- =============================================

CREATE TABLE IF NOT EXISTS password_reset_attempts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED,
  username    VARCHAR(50),
  ip_address  VARCHAR(45),
  success     BOOLEAN NOT NULL DEFAULT FALSE,
  fail_reason VARCHAR(100),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_reset_user (user_id),
  INDEX idx_reset_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- AUDIT_LOGS: campos adicionales
-- =============================================

SET @audit_role_name_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'role_name'
);
SET @sql = IF(
  @audit_role_name_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN role_name VARCHAR(50) NULL AFTER username',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @audit_session_id_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'session_id'
);
SET @sql = IF(
  @audit_session_id_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN session_id INT UNSIGNED NULL AFTER new_values',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @audit_device_info_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'device_info'
);
SET @sql = IF(
  @audit_device_info_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN device_info VARCHAR(255) NULL AFTER session_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @audit_result_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'result'
);
SET @sql = IF(
  @audit_result_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN result ENUM(''success'',''failure'') NOT NULL DEFAULT ''success'' AFTER ip_address',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @audit_reason_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'reason'
);
SET @sql = IF(
  @audit_reason_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN reason VARCHAR(255) NULL AFTER result',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================
-- PROMOTIONS: campos adicionales
-- =============================================

SET @promo_auto_apply_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'promotions'
    AND column_name = 'auto_apply'
);
SET @sql = IF(
  @promo_auto_apply_exists = 0,
  'ALTER TABLE promotions ADD COLUMN auto_apply BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @promo_priority_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'promotions'
    AND column_name = 'priority'
);
SET @sql = IF(
  @promo_priority_exists = 0,
  'ALTER TABLE promotions ADD COLUMN priority TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER auto_apply',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @promo_updated_by_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'promotions'
    AND column_name = 'updated_by'
);
SET @sql = IF(
  @promo_updated_by_exists = 0,
  'ALTER TABLE promotions ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_by',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @promo_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'promotions'
    AND CONSTRAINT_NAME = 'fk_promotions_updated_by'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @promo_fk_exists = 0,
  'ALTER TABLE promotions ADD CONSTRAINT fk_promotions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================
-- SYSTEM_SETTINGS: configuracion de sesiones
-- =============================================

INSERT IGNORE INTO system_settings (key_name, value, description) VALUES
  ('session_timeout_minutes', '480', 'Minutos de inactividad antes de cerrar sesion automaticamente'),
  ('session_max_hours', '24', 'Duracion maxima de una sesion activa en horas'),
  ('max_reset_attempts', '5', 'Intentos maximos de recuperacion de contrasena por hora');
