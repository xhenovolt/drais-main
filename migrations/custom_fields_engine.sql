-- ============================================================================
-- P1 — Custom Field Engine
--
-- Lets a school admin define their own per-student data fields entirely from
-- the UI (bus route, dormitory, Quran level, sponsor, parish, transport
-- stage, medical condition, tribe/clan, baptism status, …) without ever
-- editing the schema or calling the manufacturer.
--
-- Two tables:
--   * `custom_fields`         — per-school field definitions (a mini-schema)
--   * `student_custom_values` — one row per (student, field) holding the value
--
-- Read path in DRCE:
--   queries.ts pulls custom values per student into snapshot.classes[].students[],
--   adapter surfaces them as `student.custom.<code>`, the DRCE binding picker
--   lists every field as `student.custom.<code>` automatically.
--
-- Write path:
--   /api/admin/custom-fields   — CRUD field definitions
--   /api/students/<id>/custom-values — read/write a learner's values
--
-- Rollback:
--   DROP TABLE student_custom_values;
--   DROP TABLE custom_fields;
-- ============================================================================

-- 1. Field definitions. Scoped to a school; `code` is the binding suffix used
--    in DRCE (`student.custom.<code>`) and in API payloads, so we constrain
--    it to a safe identifier shape with a UNIQUE per school.
CREATE TABLE IF NOT EXISTS custom_fields (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  school_id       INT          NOT NULL,
  entity_type     ENUM('student','staff') NOT NULL DEFAULT 'student',
  code            VARCHAR(64)  NOT NULL,           -- snake_case, [a-z0-9_]
  label           VARCHAR(160) NOT NULL,           -- shown to users
  description     VARCHAR(400) NULL,
  data_type       ENUM(
                    'text','long_text','number','date','boolean',
                    'select','multiselect','phone','email','url'
                  ) NOT NULL,
  -- For select / multiselect: JSON array of {value,label}. Null otherwise.
  options_json    JSON         NULL,
  -- Validation rules (min, max, minLength, maxLength, pattern, required).
  validation_json JSON         NULL,
  default_value   TEXT         NULL,
  is_required     TINYINT(1)   NOT NULL DEFAULT 0,
  is_searchable   TINYINT(1)   NOT NULL DEFAULT 1,
  -- Optional permission code required to read/write. NULL = follow base
  -- entity permissions (students.read / students.update).
  read_permission  VARCHAR(80) NULL,
  write_permission VARCHAR(80) NULL,
  display_order   INT          NOT NULL DEFAULT 100,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_school_entity_code (school_id, entity_type, code),
  KEY idx_school_entity_active (school_id, entity_type, is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Per-student values. Sparse: only rows for fields the student actually
--    has a value for. Multiple typed columns let us index/search the value
--    natively for the most common types; `value_json` carries the rest
--    (multiselect arrays, structured payloads).
--
--    The composite UNIQUE (student_id, field_id) is the conflict target the
--    upsert path uses; an entry is created on first set and updated thereafter.
CREATE TABLE IF NOT EXISTS student_custom_values (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  student_id      BIGINT       NOT NULL,
  field_id        BIGINT       NOT NULL,
  -- Typed value columns. Exactly one is populated, matching field.data_type.
  -- text covers: text, long_text, select (the selected value), phone, email, url.
  value_text      TEXT         NULL,
  value_number    DECIMAL(20,6) NULL,
  value_date      DATE         NULL,
  value_bool      TINYINT(1)   NULL,
  value_json      JSON         NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by      BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_student_field (student_id, field_id),
  KEY idx_field_value_text (field_id, value_text(64)),
  KEY idx_field_value_number (field_id, value_number),
  KEY idx_field_value_date (field_id, value_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Seed the permission row so existing role-management UIs can grant it.
--    Super-admins bypass via isSuperAdmin; non-superadmin school admins
--    need this code attached to a role.
INSERT IGNORE INTO permissions (code, module, resource, action, description, is_active)
VALUES ('custom_fields.manage', 'custom_fields', 'fields', 'manage',
        'Create / edit / archive per-school custom field definitions', 1);
