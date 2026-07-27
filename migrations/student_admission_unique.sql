-- SP-1 — Student admission-number integrity (DRAIS Student Management Hardening)
--
-- GOAL: the DATABASE (not app-level SELECT COUNT(*)) guarantees no two active
-- students in a school share an admission number. This closes the TOCTOU race
-- in getNextAdmissionNumber() that produced 108 duplicate learners (a double
-- import in schools 12008 / 12011, 2026-07 audit).
--
-- ┌─ PRECONDITION ───────────────────────────────────────────────────────────┐
-- │ This ALTER WILL FAIL while duplicate (school_id, admission_no) rows exist. │
-- │ Resolve the duplicate LEARNERS first (merge via /students/duplicates or    │
-- │ the reviewed batch), THEN run this. Verify with:                           │
-- │   SELECT school_id, admission_no, COUNT(*) n FROM students                 │
-- │    WHERE admission_no IS NOT NULL AND TRIM(admission_no)<>'' AND deleted_at │
-- │    IS NULL GROUP BY school_id, admission_no HAVING n>1;   -- must be empty  │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- NOTE on NULLs: MySQL/TiDB treat NULLs as DISTINCT in a UNIQUE index, so the
-- 1,263 students with a NULL/blank admission_no are unaffected (multiple NULLs
-- are allowed). Only real, non-null numbers are constrained.

ALTER TABLE students
  ADD UNIQUE KEY uk_student_school_admission (school_id, admission_no);

-- After this lands, getNextAdmissionNumber's callers should treat a duplicate-
-- key error as "retry with the next sequence", which makes concurrent admits
-- race-safe at the database level.
