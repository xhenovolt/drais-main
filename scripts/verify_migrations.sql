-- DRAIS migration verification — READ ONLY. Modifies nothing.
-- Run against the target DB; each row reports PRESENT/MISSING for an object the
-- application code depends on. Anything MISSING means the matching migration in
-- docs/MIGRATION_RUNBOOK.md has not been applied yet.
--
-- Usage:
--   mysql -h $TIDB_HOST -P $TIDB_PORT -u $TIDB_USER -p$TIDB_PASSWORD \
--         --ssl-mode=VERIFY_IDENTITY $TIDB_DB < scripts/verify_migrations.sql
--
-- Replace DATABASE() if you query from a different schema context.

SELECT 'TABLES' AS check_group, '' AS object, '' AS status
UNION ALL
SELECT '  platform_api_foundation', t.tn,
       IF(COUNT(c.table_name) > 0, 'PRESENT', 'MISSING')
  FROM (SELECT 'platform_api_keys' tn UNION ALL SELECT 'platform_api_audit'
        UNION ALL SELECT 'platform_events' UNION ALL SELECT 'webhook_subscriptions'
        UNION ALL SELECT 'webhook_deliveries' UNION ALL SELECT 'platform_idempotency_keys'
        UNION ALL SELECT 'platform_rate_limits') t
  LEFT JOIN information_schema.tables c
    ON c.table_schema = DATABASE() AND c.table_name = t.tn
 GROUP BY t.tn
UNION ALL
SELECT '  search_index', 'search_index',
       IF(COUNT(*) > 0, 'PRESENT', 'MISSING')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'search_index'
UNION ALL
SELECT '  parent_portal', t.tn,
       IF(COUNT(c.table_name) > 0, 'PRESENT', 'MISSING')
  FROM (SELECT 'parent_accounts' tn UNION ALL SELECT 'parent_student_links'
        UNION ALL SELECT 'parent_otp_codes' UNION ALL SELECT 'parent_sessions') t
  LEFT JOIN information_schema.tables c
    ON c.table_schema = DATABASE() AND c.table_name = t.tn
 GROUP BY t.tn
UNION ALL
SELECT 'COLUMNS', 'schools.external_id',
       IF(COUNT(*) > 0, 'PRESENT', 'MISSING')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'schools' AND column_name = 'external_id'
UNION ALL
SELECT 'INDEXES', 'webhook_deliveries.uq_webhook_del_sub_event',
       IF(COUNT(*) > 0, 'PRESENT', 'MISSING')
  FROM information_schema.statistics
 WHERE table_schema = DATABASE() AND table_name = 'webhook_deliveries'
   AND index_name = 'uq_webhook_del_sub_event'
UNION ALL
SELECT 'INDEXES', 'platform_api_audit.ix_platform_audit_error_time',
       IF(COUNT(*) > 0, 'PRESENT', 'MISSING')
  FROM information_schema.statistics
 WHERE table_schema = DATABASE() AND table_name = 'platform_api_audit'
   AND index_name = 'ix_platform_audit_error_time'
UNION ALL
SELECT 'TRIGGER', 'trg_schools_ensure_external_id',
       IF(COUNT(*) > 0, 'PRESENT', 'MISSING')
  FROM information_schema.triggers
 WHERE trigger_schema = DATABASE() AND trigger_name = 'trg_schools_ensure_external_id'
UNION ALL
SELECT 'SETTING', 'parent_link_auto_approve (any school)',
       IF(COUNT(*) > 0, 'PRESENT', 'MISSING')
  FROM school_settings WHERE key_name = 'parent_link_auto_approve';
