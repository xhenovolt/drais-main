-- Tahfiz Phase 2F — Book Structure Engine schema (approved).
-- Global canonical books + school enablement + custom books + Qur'an reference.
-- Qur'an reference data is GLOBAL (school_id = NULL / not scoped) and seeded from
-- the pinned authoritative Tanzil metadata (docs/tahfiz/quran-data.tanzil.xml,
-- CC-BY © Tanzil.info). Idempotent.

-- ── Global canonical books (shared across all schools) ────────────────────
CREATE TABLE IF NOT EXISTS tahfiz_global_books (
  id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
  code           VARCHAR(40)  NOT NULL,                 -- 'quran' | 'yassarna' | 'shatibiyyah' | ...
  title_ar       VARCHAR(150) NULL,
  title_en       VARCHAR(150) NOT NULL,
  structure_type ENUM('quran','ordered_lessons','versed_poem','chaptered_text') NOT NULL,
  total_units    INT          NULL,                     -- e.g. 114 surahs / N lessons / N abyat
  unit_label     VARCHAR(40)  NULL,                     -- 'surah' | 'lesson' | 'bayt' | 'chapter'
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  source_note    VARCHAR(255) NULL,
  version        VARCHAR(60)  NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_global_book_code (code)
);

-- ── School enablement of global books ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tahfiz_school_books (
  id                 BIGINT      PRIMARY KEY AUTO_INCREMENT,
  school_id          BIGINT      NOT NULL,
  global_book_id     BIGINT      NOT NULL,
  enabled            TINYINT(1)  NOT NULL DEFAULT 1,
  local_name_override VARCHAR(150) NULL,
  teaching_order     INT         NULL,
  default_for_program VARCHAR(50) NULL,
  created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_book (school_id, global_book_id),
  KEY idx_school_books (school_id, enabled)
);

-- ── Custom school-specific books ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tahfiz_custom_books (
  id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
  school_id      BIGINT       NOT NULL,
  title          VARCHAR(150) NOT NULL,
  structure_type ENUM('ordered_lessons','versed_poem','chaptered_text') NOT NULL DEFAULT 'ordered_lessons',
  unit_label     VARCHAR(40)  NULL,
  total_units    INT          NULL,
  teaching_order INT          NULL,
  status         ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_by     BIGINT       NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME     NULL,
  deleted_by     BIGINT       NULL,
  delete_reason  VARCHAR(255) NULL,
  KEY idx_custom_books (school_id, status)
);

CREATE TABLE IF NOT EXISTS tahfiz_custom_book_units (
  id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
  school_id      BIGINT       NOT NULL,
  custom_book_id BIGINT       NOT NULL,
  order_index    INT          NOT NULL,
  label          VARCHAR(150) NOT NULL,
  parent_unit_id BIGINT       NULL,
  page_from      INT          NULL,
  page_to        INT          NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_custom_units (custom_book_id, order_index)
);

-- ── Qur'an reference (GLOBAL; seeded from Tanzil) ─────────────────────────
CREATE TABLE IF NOT EXISTS tahfiz_quran_surahs (
  number          INT          PRIMARY KEY,             -- 1..114
  name_ar         VARCHAR(80)  NOT NULL,
  name_translit   VARCHAR(80)  NOT NULL,
  name_en         VARCHAR(120) NULL,
  ayah_count      INT          NOT NULL,                -- Hafs/Kufan
  revelation_type ENUM('Meccan','Medinan') NOT NULL,
  juz_start       INT          NULL,
  start_page      INT          NULL,
  end_page        INT          NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_juz (
  juz_number   INT PRIMARY KEY,                         -- 1..30
  start_surah  INT NOT NULL,
  start_ayah   INT NOT NULL,
  start_page   INT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_hizb (
  hizb_number  INT PRIMARY KEY,                         -- 1..60
  juz_number   INT NOT NULL,
  start_surah  INT NOT NULL,
  start_ayah   INT NOT NULL,
  start_page   INT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_quarters (
  quarter_number INT PRIMARY KEY,                       -- 1..240 (rubʿ al-hizb)
  hizb_number    INT NOT NULL,
  juz_number     INT NOT NULL,
  start_surah    INT NOT NULL,
  start_ayah     INT NOT NULL,
  start_page     INT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_pages (
  page_number  INT PRIMARY KEY,                         -- 1..604 (Madinah 15-line)
  start_surah  INT NOT NULL,
  start_ayah   INT NOT NULL
);
