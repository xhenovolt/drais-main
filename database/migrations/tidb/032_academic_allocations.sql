-- Flexible academic allocations. class_subjects is already many-to-many (no
-- unique class+subject key; multi-teacher rows already exist), so we EXTEND it
-- into the allocation model rather than create a parallel table. Existing rows
-- default to primary_teacher + display_on_report, so reports are unchanged.

-- Subject groups (Sciences, Humanities, Languages, Theology, Vocational, …).
CREATE TABLE IF NOT EXISTS subject_groups (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  school_id   BIGINT       NOT NULL,
  name        VARCHAR(120) NOT NULL,
  code        VARCHAR(40)  NULL,
  description VARCHAR(255) NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  status      VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school (school_id, status)
);

-- Departments can roll up into a subject group.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS subject_group_id BIGINT NULL;

-- Subjects belong to a department (primary) + optionally a group.
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS department_id    BIGINT NULL;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS subject_group_id BIGINT NULL;

-- Allocation fields on class_subjects (each row = one teacher on a subject/class).
-- allocation_role: primary_teacher|assistant_teacher|practical_teacher|theory_teacher|examiner|substitute|hod
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS academic_year_id    BIGINT       NULL;
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS allocation_role     VARCHAR(24)  NOT NULL DEFAULT 'primary_teacher';
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS display_on_report   TINYINT      NOT NULL DEFAULT 1;
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS contribution_weight DECIMAL(6,2) NULL;
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS status              VARCHAR(16)  NOT NULL DEFAULT 'active';
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS notes               VARCHAR(255) NULL;
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS created_by          BIGINT       NULL;
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS updated_by          BIGINT       NULL;
