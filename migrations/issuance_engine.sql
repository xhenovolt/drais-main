-- ============================================================================
-- DRCE — universal issuance engine.
--
-- One infrastructure for issuing certificates, ID cards, transcripts,
-- letters, anything a DRCE template can render. Reuses the existing P2
-- VisibilityRule type as eligibility criteria; no new rule language.
--
-- Three tables:
--   issuance_batches   — one row per "issue this template to this cohort"
--   issuance_items     — one row per (batch, recipient) — the unit that
--                        actually got rendered, with the rendered HTML
--                        archived for re-print without re-evaluating data.
--   issuance_audit_log — every state transition on a batch
--
-- A batch's lifecycle:
--   draft → previewed → generating → generated → printed → (archived)
--                     ↘ failed
--
-- Dedupe: UNIQUE (template_id, recipient_kind, recipient_id, issued_run_key)
-- prevents accidentally double-issuing the same certificate. The
-- `issued_run_key` is a school-supplied string (e.g. "term-3-2026-prefects")
-- so the same template can be issued multiple times for distinct events.
--
-- Rollback:
--   DROP TABLE issuance_items;
--   DROP TABLE issuance_audit_log;
--   DROP TABLE issuance_batches;
-- ============================================================================

CREATE TABLE IF NOT EXISTS issuance_batches (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  school_id         INT          NOT NULL,
  template_id       BIGINT       NOT NULL,
  document_kind     VARCHAR(64)  NOT NULL,         -- 'certificate' | 'id_card' | ...
  name              VARCHAR(200) NOT NULL,         -- 'Term 3 2026 — Prefects'
  description       VARCHAR(500) NULL,
  /** Eligibility rule serialised as VisibilityRule JSON (P2). NULL = "all
   *  enrolled active learners in scope". */
  eligibility_json  JSON         NULL,
  /** Scope hint — limits the candidate pool BEFORE eligibility runs.
   *  Free-form JSON: { classIds?: number[], streamIds?: number[],
   *                    termId?: number, yearId?: number,
   *                    studentIds?: number[] } */
  scope_json        JSON         NULL,
  /** Idempotency key — same template + same recipient + same key blocks
   *  double-issue. School-supplied; falls back to the batch id. */
  issued_run_key    VARCHAR(120) NOT NULL DEFAULT '',
  status            ENUM('draft','previewed','generating','generated',
                         'printed','failed','archived') NOT NULL DEFAULT 'draft',
  counts_json       JSON         NULL,             -- {candidates, eligible, issued, skipped, errored}
  generated_at      DATETIME     NULL,
  printed_at        DATETIME     NULL,
  failed_reason     VARCHAR(500) NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by        BIGINT       NULL,
  PRIMARY KEY (id),
  KEY idx_batch_school_status (school_id, status, created_at),
  KEY idx_batch_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issuance_items (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  batch_id        BIGINT       NOT NULL,
  recipient_kind  ENUM('student','staff') NOT NULL DEFAULT 'student',
  recipient_id    BIGINT       NOT NULL,
  /** Frozen at generation time — what the recipient looked like when
   *  the document was issued. Lets re-prints be byte-identical even if
   *  the student record changes afterwards. */
  recipient_snapshot_json JSON NULL,
  /** Rendered HTML at generation time, suitable for re-print without
   *  re-evaluating data bindings. Optional — large batches may store
   *  rendered output on disk instead. */
  rendered_html   LONGTEXT     NULL,
  status          ENUM('eligible','issued','skipped','errored','reprinted')
                    NOT NULL DEFAULT 'eligible',
  skip_reason     VARCHAR(300) NULL,
  error_message   VARCHAR(500) NULL,
  issued_at       DATETIME     NULL,
  issued_by       BIGINT       NULL,
  reprint_count   INT          NOT NULL DEFAULT 0,
  last_reprinted_at DATETIME   NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_item_batch (batch_id, status),
  KEY idx_item_recipient (recipient_kind, recipient_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dedupe lookup: same template + same recipient + same run-key cannot
-- exist twice across the union of batches for a school.
-- Implemented as a denormalised key table that the service maintains.
CREATE TABLE IF NOT EXISTS issuance_dedupe_keys (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  school_id      INT          NOT NULL,
  template_id    BIGINT       NOT NULL,
  recipient_kind ENUM('student','staff') NOT NULL DEFAULT 'student',
  recipient_id   BIGINT       NOT NULL,
  issued_run_key VARCHAR(120) NOT NULL,
  batch_id       BIGINT       NOT NULL,
  item_id        BIGINT       NOT NULL,
  issued_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_dedupe (school_id, template_id, recipient_kind, recipient_id, issued_run_key),
  KEY idx_dedupe_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issuance_audit_log (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  batch_id     BIGINT       NOT NULL,
  actor_user_id BIGINT      NULL,
  action       VARCHAR(40)  NOT NULL,             -- 'created' | 'previewed' | 'generated' | 'printed' | 'archived' | 'failed'
  detail_json  JSON         NULL,
  at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_batch (batch_id, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed three permissions for the issuance verbs (separable from drce.edit
-- so a school can let a registrar issue certificates without granting them
-- template-edit rights).
INSERT IGNORE INTO permissions (code, module, resource, action, description, is_active)
VALUES
  ('issuance.view',     'issuance', 'batch', 'view',     'View issuance batches and audit logs', 1),
  ('issuance.create',   'issuance', 'batch', 'create',   'Create + preview + generate issuance batches', 1),
  ('issuance.print',    'issuance', 'batch', 'print',    'Print or re-print issued documents', 1);
