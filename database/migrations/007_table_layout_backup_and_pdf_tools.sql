-- =============================================
-- Layout de mesas por zonas + permisos de backup/PDF
-- =============================================

CREATE TABLE IF NOT EXISTS table_layout_zones (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  `rows`      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `cols`      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_table_layout_zones_name (name),
  KEY idx_table_layout_zones_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_bar_tables_zone_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bar_tables'
    AND column_name = 'zone_id'
);
SET @sql := IF(
  @has_bar_tables_zone_id = 0,
  'ALTER TABLE bar_tables ADD COLUMN zone_id INT UNSIGNED NULL AFTER capacity',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_bar_tables_layout_row := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bar_tables'
    AND column_name = 'layout_row'
);
SET @sql := IF(
  @has_bar_tables_layout_row = 0,
  'ALTER TABLE bar_tables ADD COLUMN layout_row SMALLINT UNSIGNED NULL AFTER zone_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_bar_tables_layout_col := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bar_tables'
    AND column_name = 'layout_col'
);
SET @sql := IF(
  @has_bar_tables_layout_col = 0,
  'ALTER TABLE bar_tables ADD COLUMN layout_col SMALLINT UNSIGNED NULL AFTER layout_row',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_bar_tables_layout_order := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bar_tables'
    AND column_name = 'layout_order'
);
SET @sql := IF(
  @has_bar_tables_layout_order = 0,
  'ALTER TABLE bar_tables ADD COLUMN layout_order SMALLINT UNSIGNED NULL AFTER layout_col',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO table_layout_zones (name, sort_order)
SELECT derived.zone_name, derived.sort_order
FROM (
  SELECT
    COALESCE(NULLIF(TRIM(zone), ''), 'General') AS zone_name,
    ROW_NUMBER() OVER (
      ORDER BY MIN(position_y), MIN(position_x), COALESCE(NULLIF(TRIM(zone), ''), 'General')
    ) AS sort_order
  FROM bar_tables
  GROUP BY COALESCE(NULLIF(TRIM(zone), ''), 'General')
) AS derived
LEFT JOIN table_layout_zones existing ON existing.name = derived.zone_name
WHERE existing.id IS NULL;

UPDATE bar_tables t
JOIN table_layout_zones z
  ON z.name = COALESCE(NULLIF(TRIM(t.zone), ''), 'General')
SET t.zone_id = z.id
WHERE t.zone_id IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_zone_layout_counts;
CREATE TEMPORARY TABLE tmp_zone_layout_counts AS
SELECT
  z.id AS zone_id,
  COUNT(t.id) AS table_count,
  GREATEST(1, CEIL(SQRT(GREATEST(COUNT(t.id), 1)))) AS calc_cols,
  GREATEST(1, CEIL(COUNT(t.id) / GREATEST(1, CEIL(SQRT(GREATEST(COUNT(t.id), 1)))))) AS calc_rows
FROM table_layout_zones z
LEFT JOIN bar_tables t ON t.zone_id = z.id
GROUP BY z.id;

UPDATE table_layout_zones z
JOIN tmp_zone_layout_counts c ON c.zone_id = z.id
SET z.`cols` = CASE
      WHEN z.`cols` IS NULL OR z.`cols` = 0 OR (z.`cols` = 1 AND z.`rows` = 1 AND c.table_count > 1) THEN c.calc_cols
      ELSE z.`cols`
    END,
    z.`rows` = CASE
      WHEN z.`rows` IS NULL OR z.`rows` = 0 OR (z.`cols` = 1 AND z.`rows` = 1 AND c.table_count > 1) THEN c.calc_rows
      ELSE z.`rows`
    END;

DROP TEMPORARY TABLE IF EXISTS tmp_table_layout_order;
CREATE TEMPORARY TABLE tmp_table_layout_order AS
SELECT
  t.id AS table_id,
  t.zone_id,
  ROW_NUMBER() OVER (
    PARTITION BY t.zone_id
    ORDER BY t.position_y, t.position_x, t.number
  ) AS layout_order
FROM bar_tables t
WHERE t.zone_id IS NOT NULL;

UPDATE bar_tables t
JOIN tmp_table_layout_order l ON l.table_id = t.id
JOIN tmp_zone_layout_counts c ON c.zone_id = l.zone_id
SET t.layout_order = COALESCE(t.layout_order, l.layout_order),
    t.layout_row = COALESCE(t.layout_row, FLOOR((l.layout_order - 1) / c.calc_cols) + 1),
    t.layout_col = COALESCE(t.layout_col, MOD(l.layout_order - 1, c.calc_cols) + 1)
WHERE t.layout_order IS NULL
   OR t.layout_row IS NULL
   OR t.layout_col IS NULL;

SET @has_bar_tables_zone_layout_order_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'bar_tables'
    AND index_name = 'uq_bar_tables_zone_layout_order'
);
SET @sql := IF(
  @has_bar_tables_zone_layout_order_idx = 0,
  'ALTER TABLE bar_tables ADD UNIQUE KEY uq_bar_tables_zone_layout_order (zone_id, layout_order)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_bar_tables_zone_layout_cell_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'bar_tables'
    AND index_name = 'uq_bar_tables_zone_layout_cell'
);
SET @sql := IF(
  @has_bar_tables_zone_layout_cell_idx = 0,
  'ALTER TABLE bar_tables ADD UNIQUE KEY uq_bar_tables_zone_layout_cell (zone_id, layout_row, layout_col)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_bar_tables_zone_fk := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'bar_tables'
    AND constraint_name = 'fk_bar_tables_zone_id'
);
SET @sql := IF(
  @has_bar_tables_zone_fk = 0,
  'ALTER TABLE bar_tables ADD CONSTRAINT fk_bar_tables_zone_id FOREIGN KEY (zone_id) REFERENCES table_layout_zones(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO permissions (name, module, description)
SELECT 'backup.manage', 'tools', 'Exportar respaldos SQL'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'backup.manage');

INSERT INTO permissions (name, module, description)
SELECT 'backup.restore', 'tools', 'Importar respaldos SQL'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'backup.restore');

INSERT INTO permissions (name, module, description)
SELECT 'reports.export_pdf', 'reports', 'Exportar reportes contables en PDF'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'reports.export_pdf');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.name = 'admin'
  AND rp.role_id IS NULL;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('backup.manage', 'backup.restore', 'reports.export_pdf')
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.name = 'developer'
  AND rp.role_id IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_table_layout_order;
DROP TEMPORARY TABLE IF EXISTS tmp_zone_layout_counts;
