-- ============================================================================
-- Phase B — Positions master
--
-- Replace free-text `staff.position` with FK + curated catalog. The text
-- column stays during the transition (dual-write) so every SELECT-only
-- consumer continues to work. Phase I drops the text column once all
-- write paths are confirmed to write `position_id`.
--
-- Catalog: 22 global entries (school_id NULL). Schools can later create
-- their own custom positions by inserting with school_id set; the API
-- enforces super-admin for global rows.
--
-- Backfill mapping is heuristic — every existing free-text value is
-- examined and routed to the closest catalog entry. Unmatched values
-- land in 'Other Staff' so no row is left without a position_id.
--
-- Rollback:
--   ALTER TABLE staff DROP FOREIGN KEY fk_staff_position;
--   ALTER TABLE staff DROP COLUMN position_id;
--   DROP TABLE positions;
-- ============================================================================

CREATE TABLE IF NOT EXISTS positions (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  /** NULL = global / system catalog; non-null = school-authored custom. */
  school_id       INT          NULL,
  code            VARCHAR(64)  NOT NULL,
  name            VARCHAR(120) NOT NULL,
  category        ENUM('academic','admin','finance','support','spiritual')
                  NOT NULL,
  /** True iff staff with this position actively teach classes — used by
      the teacher classifier in place of the old substring regex. */
  is_teaching     TINYINT(1)   NOT NULL DEFAULT 0,
  /** Optional advisory: a sensible default role for someone in this
      position. Never enforced — staff and roles remain independently
      assignable. */
  default_role_id INT          NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  display_order   INT          NOT NULL DEFAULT 100,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_position_code_per_school (school_id, code),
  KEY idx_position_category (category, is_active),
  KEY idx_position_teaching (is_teaching, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the global catalog (school_id NULL). INSERT IGNORE makes the
-- migration idempotent.
INSERT IGNORE INTO positions
  (school_id, code, name, category, is_teaching, display_order)
VALUES
  -- Academic / teaching
  (NULL, 'head_teacher',          'Head Teacher',          'academic',  1,  10),
  (NULL, 'deputy_head',           'Deputy Head Teacher',   'academic',  0,  20),
  (NULL, 'director_of_studies',   'Director of Studies',   'academic',  0,  30),
  (NULL, 'deputy_dos',            'Deputy Director of Studies', 'academic', 0, 40),
  (NULL, 'senior_woman',          'Senior Woman Teacher',  'academic',  1,  50),
  (NULL, 'senior_man',            'Senior Man Teacher',    'academic',  1,  60),
  (NULL, 'teacher',               'Teacher',               'academic',  1,  70),
  (NULL, 'assistant_teacher',     'Assistant Teacher',     'academic',  1,  80),

  -- Spiritual
  (NULL, 'imam',                  'Imam',                  'spiritual', 0, 110),
  (NULL, 'sheikh',                'Sheikh',                'spiritual', 1, 120),
  (NULL, 'tahfiz_instructor',     'Tahfiz Instructor',     'spiritual', 1, 130),

  -- Administration
  (NULL, 'director',              'Director',              'admin',     0, 210),
  (NULL, 'secretary',             'Secretary',             'admin',     0, 220),
  (NULL, 'other_admin',           'Other Administrative',  'admin',     0, 290),

  -- Finance
  (NULL, 'bursar',                'Bursar',                'finance',   0, 310),
  (NULL, 'accountant',            'Accountant',            'finance',   0, 320),
  (NULL, 'cashier',                'Cashier',              'finance',   0, 330),

  -- Support
  (NULL, 'librarian',             'Librarian',             'support',   0, 410),
  (NULL, 'lab_attendant',         'Lab Attendant',         'support',   0, 420),
  (NULL, 'it_technician',         'IT Technician',         'support',   0, 430),
  (NULL, 'nurse',                 'Nurse',                 'support',   0, 440),
  (NULL, 'matron',                'Matron',                'support',   0, 450),
  (NULL, 'driver',                'Driver',                'support',   0, 460),
  (NULL, 'security_officer',      'Security Officer',      'support',   0, 470),
  (NULL, 'cleaner',                'Cleaner',              'support',   0, 480),
  (NULL, 'other_staff',           'Other Staff',           'support',   0, 990);

-- Add FK column on staff. Nullable until backfill completes.
ALTER TABLE staff
  ADD COLUMN position_id BIGINT NULL AFTER position;

ALTER TABLE staff
  ADD CONSTRAINT fk_staff_position
    FOREIGN KEY (position_id) REFERENCES positions(id);

ALTER TABLE staff
  ADD INDEX idx_staff_position (position_id);

-- Backfill: heuristic mapping from the existing free-text staff.position
-- column to the catalog. The CASE chain is ordered most-specific to
-- least-specific so "head teacher" matches Head Teacher before falling
-- through to Teacher, etc. Unmatched values land in 'other_staff'.
UPDATE staff s
   SET position_id = (
     SELECT p.id FROM positions p
      WHERE p.school_id IS NULL
        AND p.code = CASE
          -- Academic: head + teacher
          WHEN LOWER(s.position) LIKE '%head%teacher%' THEN 'head_teacher'
          WHEN LOWER(s.position) LIKE '%headteacher%'  THEN 'head_teacher'
          -- Director of Studies variants
          WHEN LOWER(s.position) LIKE '%assistant%director%studies%' THEN 'deputy_dos'
          WHEN LOWER(s.position) LIKE '%deputy%director%studies%'     THEN 'deputy_dos'
          WHEN LOWER(s.position) LIKE '%director%studies%'            THEN 'director_of_studies'
          -- Deputy head
          WHEN LOWER(s.position) LIKE '%deputy%head%'  THEN 'deputy_head'
          -- Senior teachers
          WHEN LOWER(s.position) LIKE '%senior%woman%' THEN 'senior_woman'
          WHEN LOWER(s.position) LIKE '%senior%man%'   THEN 'senior_man'
          -- Generic teacher catch (after the more-specific ones above)
          WHEN LOWER(s.position) LIKE '%teacher%'      THEN 'teacher'
          WHEN LOWER(s.position) LIKE '%instructor%'   THEN 'teacher'
          -- Spiritual
          WHEN LOWER(s.position) LIKE '%imam%'         THEN 'imam'
          WHEN LOWER(s.position) LIKE '%sheikh%'       THEN 'sheikh'
          WHEN LOWER(s.position) LIKE '%tahfiz%'       THEN 'tahfiz_instructor'
          -- Finance
          WHEN LOWER(s.position) LIKE '%bursar%'       THEN 'bursar'
          WHEN LOWER(s.position) LIKE '%accountant%'   THEN 'accountant'
          WHEN LOWER(s.position) LIKE '%cashier%'      THEN 'cashier'
          -- Support
          WHEN LOWER(s.position) LIKE '%librar%'       THEN 'librarian'
          WHEN LOWER(s.position) LIKE '%lab%'          THEN 'lab_attendant'
          WHEN LOWER(s.position) LIKE '%attendant%'    THEN 'lab_attendant'
          WHEN LOWER(s.position) LIKE '%technic%'      THEN 'it_technician'
          WHEN LOWER(s.position) LIKE '%it %'          THEN 'it_technician'
          WHEN LOWER(s.position) LIKE '%nurse%'        THEN 'nurse'
          WHEN LOWER(s.position) LIKE '%matron%'       THEN 'matron'
          WHEN LOWER(s.position) LIKE '%driver%'       THEN 'driver'
          WHEN LOWER(s.position) LIKE '%security%'     THEN 'security_officer'
          WHEN LOWER(s.position) LIKE '%guard%'        THEN 'security_officer'
          WHEN LOWER(s.position) LIKE '%clean%'        THEN 'cleaner'
          -- Admin
          WHEN LOWER(s.position) LIKE '%director%'     THEN 'director'
          WHEN LOWER(s.position) LIKE '%secretary%'    THEN 'secretary'
          -- Last-resort catch-all
          ELSE 'other_staff'
        END
      LIMIT 1
   )
 WHERE s.position_id IS NULL
   AND s.position IS NOT NULL;

-- Any staff row with NULL position text → other_staff so position_id is
-- never NULL after backfill (simplifies downstream queries).
UPDATE staff
   SET position_id = (SELECT id FROM positions WHERE school_id IS NULL AND code = 'other_staff' LIMIT 1)
 WHERE position_id IS NULL;
