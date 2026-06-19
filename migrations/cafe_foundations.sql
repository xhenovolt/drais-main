-- ============================================================================
-- CAFE — Configurable Assessment Framework Engine (Phase 1)
--
-- Foundational schema for UI-driven assessment configuration. Schools define
-- assessment frameworks (Traditional Exam · NLSC AoI · Practical · Project
-- · Continuous Assessment · …), scoring models (1–3 emerging/developing/
-- competent · 1–5 · A–E · percentage · custom), grade mappings, and a
-- per-school academic mode (traditional · competency · hybrid) — all from
-- the UI, no developer involvement.
--
-- Phase 1 is INFRASTRUCTURE ONLY. None of these tables feed the snapshot
-- pipeline yet; they sit dormant until Phase 2 reads them. Every existing
-- primary school continues to use result_types and is not impacted.
--
-- Coexistence with result_types
-- -----------------------------
-- result_types stays as-is. Schools that want to upgrade re-define their
-- assessment structure inside CAFE; the existing class_results rows keep
-- working under the legacy pipeline until Phase 2's snapshot adapter
-- bridges both.
--
-- Rollback:
--   DROP TABLE class_assessment_framework;
--   DROP TABLE grade_mappings;
--   DROP TABLE assessment_components;
--   DROP TABLE assessment_frameworks;
--   DROP TABLE scoring_models;
--   DROP TABLE school_academic_settings;
--   DELETE FROM permissions WHERE code IN ('cafe.view','cafe.manage');
-- ============================================================================

-- 1. School academic mode + defaults (one row per school).
--    Lives in its own table so future settings (default framework, default
--    promotion rule, default transcript template) can land without schema
--    churn on schools.
CREATE TABLE IF NOT EXISTS school_academic_settings (
  school_id              INT          NOT NULL,
  academic_mode          ENUM('traditional','competency','hybrid')
                                       NOT NULL DEFAULT 'traditional',
  default_framework_id   BIGINT       NULL,
  -- Promotion rule + transcript template are placeholders for Phase 5.
  promotion_rule_json    JSON         NULL,
  default_transcript_template_id BIGINT NULL,
  notes                  TEXT         NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Scoring models — how a single value is captured + interpreted.
--    `kind` drives the editor: 'numeric' (0..max), 'scale' (1..N with labels),
--    'letter' (A,B,C…), 'descriptor' (open-ended text). `config_json` holds
--    the kind-specific knobs (min, max, step, scale labels, …).
--    school_id NULL → global built-in catalog rows seeded below.
CREATE TABLE IF NOT EXISTS scoring_models (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  school_id         INT          NULL,
  code              VARCHAR(64)  NOT NULL,
  name              VARCHAR(160) NOT NULL,
  description       VARCHAR(400) NULL,
  kind              ENUM('numeric','scale','letter','descriptor')
                                  NOT NULL DEFAULT 'numeric',
  config_json       JSON         NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by        BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_scoring_model_scope (school_id, code),
  KEY idx_scoring_model_school (school_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Grade mappings — band → label/colour/points/promotes-eligibility.
--    Each scoring_model can have N mappings. For numeric/scale models the
--    bounds are inclusive; for letter/descriptor models the lower/upper
--    fields are NULL and `code` is the lookup key.
CREATE TABLE IF NOT EXISTS grade_mappings (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  scoring_model_id  BIGINT       NOT NULL,
  lower_bound       DECIMAL(10,4) NULL,
  upper_bound       DECIMAL(10,4) NULL,
  code              VARCHAR(32)  NOT NULL,
  label             VARCHAR(120) NOT NULL,
  descriptor        VARCHAR(300) NULL,
  color             VARCHAR(16)  NULL,
  points            DECIMAL(8,4) NULL,
  promotes          TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order        INT          NOT NULL DEFAULT 100,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_grade_model_sort (scoring_model_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Assessment frameworks — a bundle of components describing a complete
--    assessment regime for a class/term.
--    `mode` mirrors the school setting and lets a hybrid school have one
--    'numeric' framework for primary classes and one 'rubric' framework
--    for secondary.
CREATE TABLE IF NOT EXISTS assessment_frameworks (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  school_id         INT          NOT NULL,
  code              VARCHAR(64)  NOT NULL,
  name              VARCHAR(160) NOT NULL,
  description       VARCHAR(400) NULL,
  mode              ENUM('numeric','rubric','descriptor','mixed')
                                  NOT NULL DEFAULT 'numeric',
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by        BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_framework_school_code (school_id, code),
  KEY idx_framework_school_active (school_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Assessment components — the actual cells captured per
--    (student × subject × component) once Phase 2 lands. Each carries its
--    own scoring_model so a framework can mix numeric (Theory 80%) with
--    rubric (Practical 1–5) with descriptor (Generic skill rubric).
CREATE TABLE IF NOT EXISTS assessment_components (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  framework_id      BIGINT       NOT NULL,
  code              VARCHAR(64)  NOT NULL,
  name              VARCHAR(160) NOT NULL,
  description       VARCHAR(400) NULL,
  scoring_model_id  BIGINT       NOT NULL,
  -- Component weight within the framework. 0..1 fractions or any number
  -- (we normalise at evaluation time). Defaults to equal-weight allocation.
  weight            DECIMAL(8,4) NOT NULL DEFAULT 1.0,
  min_score         DECIMAL(10,4) NULL,
  max_score         DECIMAL(10,4) NULL,
  -- If true, the component MUST have a value for the rollup to compute.
  is_required       TINYINT(1)   NOT NULL DEFAULT 0,
  -- Sequence lock: components further down depend on earlier ones being
  -- present (e.g. Theory must be entered before Practical). Phase 3 UI
  -- consumes this; Phase 1 just stores it.
  sequence_locked   TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order        INT          NOT NULL DEFAULT 100,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_component_framework_code (framework_id, code),
  KEY idx_component_framework_sort (framework_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Class × framework assignment per term. subject_id is a *future*
--    override: NULL = framework applies to every subject in this (class,
--    term); a non-NULL row scopes a different framework to one subject.
--    Phase 1 only writes NULL rows; Phase 3+ may write subject overrides.
CREATE TABLE IF NOT EXISTS class_assessment_framework (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  school_id         INT          NOT NULL,
  class_id          INT          NOT NULL,
  framework_id      BIGINT       NOT NULL,
  term_id           INT          NOT NULL,
  -- Reserved for the future per-subject override path. NULL today.
  subject_id        INT          NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by        BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_class_framework (class_id, term_id, subject_id),
  KEY idx_cf_school (school_id),
  KEY idx_cf_framework (framework_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Seed two GLOBAL scoring models (school_id NULL) so the UI has visible
--    examples on first open. Schools clone them via the UI to customise.
INSERT IGNORE INTO scoring_models (school_id, code, name, description, kind, config_json, is_active)
VALUES
  (NULL, 'pct_100',  'Percentage (0–100)',
   'Standard numeric score out of 100, used by traditional academic systems.',
   'numeric',
   JSON_OBJECT('min', 0, 'max', 100, 'step', 1),
   1),
  (NULL, 'nlsc_1_3', 'NLSC Competency Scale (1–3)',
   'Uganda New Lower Secondary Curriculum competency descriptors.',
   'scale',
   JSON_OBJECT('min', 1, 'max', 3, 'step', 1, 'labels',
     JSON_ARRAY(
       JSON_OBJECT('value', 1, 'label', 'Basic'),
       JSON_OBJECT('value', 2, 'label', 'Substantial'),
       JSON_OBJECT('value', 3, 'label', 'Accomplished')
     )),
   1);

-- 8. Seed grade mappings for the two starter scoring models. INSERT IGNORE +
--    a deterministic code per row keeps the migration idempotent.
INSERT IGNORE INTO grade_mappings
  (scoring_model_id, lower_bound, upper_bound, code, label, descriptor, color, points, promotes, sort_order)
SELECT id, 80, 100, 'A', 'Distinction', 'Exceptional performance.', '#16a34a', 6, 1, 10 FROM scoring_models WHERE code = 'pct_100' AND school_id IS NULL
UNION ALL SELECT id, 70, 79,  'B', 'Credit',      'Strong performance.',     '#22c55e', 5, 1, 20 FROM scoring_models WHERE code = 'pct_100' AND school_id IS NULL
UNION ALL SELECT id, 60, 69,  'C', 'Pass',        'Satisfactory.',           '#84cc16', 4, 1, 30 FROM scoring_models WHERE code = 'pct_100' AND school_id IS NULL
UNION ALL SELECT id, 50, 59,  'D', 'Basic',       'Meeting minimum.',        '#f59e0b', 3, 1, 40 FROM scoring_models WHERE code = 'pct_100' AND school_id IS NULL
UNION ALL SELECT id,  0, 49,  'F', 'Fail',        'Below minimum.',          '#ef4444', 0, 0, 50 FROM scoring_models WHERE code = 'pct_100' AND school_id IS NULL;

INSERT IGNORE INTO grade_mappings
  (scoring_model_id, lower_bound, upper_bound, code, label, descriptor, color, points, promotes, sort_order)
SELECT id, 3, 3, '3', 'Accomplished', 'Has achieved the competency to a high standard.', '#16a34a', 3, 1, 10 FROM scoring_models WHERE code = 'nlsc_1_3' AND school_id IS NULL
UNION ALL SELECT id, 2, 2, '2', 'Substantial',  'Has achieved the competency substantially.',     '#84cc16', 2, 1, 20 FROM scoring_models WHERE code = 'nlsc_1_3' AND school_id IS NULL
UNION ALL SELECT id, 1, 1, '1', 'Basic',        'Has begun to demonstrate the competency.',       '#f59e0b', 1, 1, 30 FROM scoring_models WHERE code = 'nlsc_1_3' AND school_id IS NULL;

-- 9. Permissions. Separate from drce.* so a Director of Studies can manage
--    CAFE without holding template-edit rights.
INSERT IGNORE INTO permissions (code, module, resource, action, description, is_active)
VALUES
  ('cafe.view',   'cafe', 'framework', 'view',   'View CAFE frameworks, scoring models, and class assignments', 1),
  ('cafe.manage', 'cafe', 'framework', 'manage', 'Create + edit + archive CAFE frameworks, scoring models, mode', 1);
  ('cafe.add', 'cafe', 'framework', 'add', 'Create CAFE frameworks, scoring models mode, mean, and man more', 1)