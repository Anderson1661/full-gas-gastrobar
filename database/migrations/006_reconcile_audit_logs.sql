SET @role_name_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'role_name'
);
SET @sql = IF(
  @role_name_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN role_name VARCHAR(50) NULL AFTER username',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @session_id_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'session_id'
);
SET @sql = IF(
  @session_id_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN session_id INT UNSIGNED NULL AFTER new_values',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @device_info_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'device_info'
);
SET @sql = IF(
  @device_info_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN device_info VARCHAR(255) NULL AFTER session_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @result_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'result'
);
SET @sql = IF(
  @result_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN result ENUM(''success'',''failure'') NOT NULL DEFAULT ''success'' AFTER ip_address',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @reason_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND column_name = 'reason'
);
SET @sql = IF(
  @reason_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN reason VARCHAR(255) NULL AFTER result',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_session_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND index_name = 'idx_audit_session'
);
SET @sql = IF(
  @idx_session_exists = 0,
  'ALTER TABLE audit_logs ADD INDEX idx_audit_session (session_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
