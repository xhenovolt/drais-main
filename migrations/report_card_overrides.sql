-- ============================================================================
-- Phase 3.1 — Per-report ephemeral overrides
--
-- Stores snapshot-bound, per-student render adjustments that are applied as
-- the LAST layer in the render pipeline:
--
--   DRCE base template
--     → frozen snapshot branding   (snapshot.meta.branding)
--     → snapshot data context       (snapshotToDRCEDataContext)
--     → override layer              (THIS table)
--     → output HTML / print
--
-- Invariants:
--   * Overrides never touch academic data. report_snapshots.snapshot_json
--     and source results/marks tables remain immutable.
--   * Overrides are scoped to a single snapshot via FK. When a snapshot is
--     deleted (flush, manual delete), its overrides cascade away.
--   * student_db_id NULL means the override applies to every student in
--     the snapshot. Non-null restricts to one learner.
--   * The override ENUM covers Phase 3.1 (hide_section, hide_row,
--     hide_subject, style_patch) and reserves slots for Phase 3.2
--     (text_replace, spacing_patch) so the column is forward-stable.
--
-- Lookup pattern is "give me every override for this (snapshot, student)";
-- the composite index covers both the snapshot-wide (student NULL) and
-- per-student paths.
--
-- Rollback:
--   DROP TABLE report_card_overrides;
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_card_overrides (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  snapshot_id     CHAR(36)     NOT NULL,
  /** Null = snapshot-wide. Non-null = scoped to one learner. */
  student_db_id   INT          NULL,
  override_kind   ENUM(
                    'hide_section',
                    'hide_row',
                    'hide_subject',
                    'style_patch',
                    'text_replace',
                    'spacing_patch'
                  ) NOT NULL,
  /** Section id, subject id, or other render-time target reference. */
  target_id       VARCHAR(64)  NULL,
  /** Override payload — shape depends on override_kind. */
  payload_json    JSON         NULL,
  created_by      INT          NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_snapshot_student (snapshot_id, student_db_id),
  KEY idx_snapshot_kind    (snapshot_id, override_kind),
  CONSTRAINT fk_overrides_snapshot
    FOREIGN KEY (snapshot_id)
    REFERENCES report_snapshots(snapshot_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
