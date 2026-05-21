-- ============================================================================
-- Phase 1 — Trash management permissions
--
-- Seed the four global trash permission codes and grant them to existing
-- system roles. Per-entity refinement (students.archive vs subjects.archive
-- etc.) lands later if ops policy needs it.
--
-- Idempotent: INSERT IGNORE leaves existing rows untouched.
--
-- Rollback:
--   DELETE FROM role_permissions
--    WHERE permission_id IN (SELECT id FROM permissions
--                             WHERE code IN ('trash.read','trash.archive','trash.restore','trash.purge'));
--   DELETE FROM permissions
--    WHERE code IN ('trash.read','trash.archive','trash.restore','trash.purge');
-- ============================================================================

INSERT IGNORE INTO permissions (code, name, description, category, is_active)
VALUES
  ('trash.read',    'View Trash',       'View archived items across the system.',                 'trash', 1),
  ('trash.archive', 'Archive Entities', 'Soft-delete (archive) an entity that supports trash.',    'trash', 1),
  ('trash.restore', 'Restore Entities', 'Restore an archived entity from trash.',                  'trash', 1),
  ('trash.purge',   'Purge Entities',   'Permanently delete an archived entity. Super-admin only.', 'trash', 1);

-- Grant read/archive/restore to admin and super_admin / superadmin roles;
-- purge stays super-admin-only.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.code IN ('trash.read', 'trash.archive', 'trash.restore')
   AND (r.slug IN ('admin', 'super_admin', 'superadmin') OR r.is_super_admin = 1);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.code = 'trash.purge'
   AND (r.slug IN ('super_admin', 'superadmin') OR r.is_super_admin = 1);
