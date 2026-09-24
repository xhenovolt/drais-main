-- 051 - ID card jobs keep the uploaded workbook in private Cloudinary storage
-- (authenticated raw asset) instead of a LONGBLOB, so workbooks larger than a
-- database row / serverless body limit are supported. storage_ref = Cloudinary
-- public_id. file_data (migration 050) is left in place, unused, so this stays
-- purely additive.
--
-- ROLLBACK:
--   ALTER TABLE id_card_jobs DROP COLUMN storage_ref;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'id_card_jobs' AND COLUMN_NAME = 'storage_ref'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE id_card_jobs ADD COLUMN storage_ref VARCHAR(255) DEFAULT NULL AFTER file_data',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
