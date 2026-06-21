-- Parent Portal Track A — Phase 1 schema deltas.
-- Applied via scripts (TiDB rejects ADD UNIQUE INDEX IF NOT EXISTS, so the
-- index is added guarded by an information_schema check). Recorded here for
-- repo history. Safe to re-run: column/index existence is checked first.

-- Opaque per-link handle exposed to clients as learnerAccessId.
-- Raw student_id never leaves the server.
ALTER TABLE parent_student_links ADD COLUMN IF NOT EXISTS access_uuid CHAR(36) NULL;
UPDATE parent_student_links SET access_uuid = UUID() WHERE access_uuid IS NULL;
-- guarded in code:
-- ALTER TABLE parent_student_links ADD UNIQUE INDEX uq_psl_access_uuid (access_uuid);

-- OTP-only accounts have no password.
ALTER TABLE parent_accounts MODIFY COLUMN password_hash VARCHAR(255) NULL;
