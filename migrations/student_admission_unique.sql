-- SP-1 — Student admission-number integrity (DRAIS Student Management Hardening)
--
-- GOAL: the DATABASE (not app-level SELECT COUNT(*)) guarantees no two ACTIVE
-- students in a school share an admission number. This closes the TOCTOU race
-- in getNextAdmissionNumber()/students/full's insert path that produced 108
-- duplicate learners (a double import in schools 12008 / 12011, 2026-07).
--
-- STATUS: applied to production 2026-07-29. All 108 duplicate pairs were
-- merged first (verified: every pair matched on first name, last name, DOB,
-- AND gender — genuine double-imports, not name collisions; neither side of
-- any pair had more enrollment/attendance/result data than its twin) via the
-- existing /api/students/duplicates/merge logic, primary = earlier-created
-- row in each pair.
--
-- ┌─ WHY A PLAIN UNIQUE KEY DOESN'T WORK ──────────────────────────────────────┐
-- │ A simple `UNIQUE KEY (school_id, admission_no)` applies to EVERY row      │
-- │ regardless of deleted_at — so a soft-deleted (merged/withdrawn) student   │
-- │ sharing a number with anything else, now or in the future, blocks this    │
-- │ ALTER forever, since merging/soft-deleting never erases admission_no.     │
-- │ MySQL/TiDB has no partial/filtered unique index, so the fix is a          │
-- │ generated column that's NULL whenever the row is soft-deleted, with the  │
-- │ unique index on THAT — matching the actual intent ("no two ACTIVE        │
-- │ students share a number"), not "no two rows ever, including trash."      │
-- │                                                                            │
-- │ Also note: TiDB does not support adding a STORED generated column via    │
-- │ ALTER TABLE (ER_UNSUPPORTED_ACTION_ON_GENERATED_COLUMN) — use VIRTUAL.    │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ PRECONDITION ───────────────────────────────────────────────────────────┐
-- │ Resolve duplicate LEARNERS first (merge via /students/duplicates or the   │
-- │ reviewed batch). Also normalize blank admission numbers to NULL first —   │
-- │ '' is NOT exempt from a unique index the way NULL is, and a school CAN    │
-- │ have more than one active student with no number assigned yet. Verify    │
-- │ both are clear with:                                                      │
-- │   UPDATE students SET admission_no = NULL WHERE admission_no = '';        │
-- │   SELECT school_id, admission_no, COUNT(*) n FROM students                 │
-- │    WHERE admission_no IS NOT NULL AND deleted_at IS NULL                   │
-- │    GROUP BY school_id, admission_no HAVING n>1;   -- must be empty         │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- NOTE on NULLs: MySQL/TiDB treat NULLs as DISTINCT in a UNIQUE index, so
-- students with a NULL admission_no are unaffected (multiple NULLs allowed).

ALTER TABLE students
  ADD COLUMN admission_no_active VARCHAR(64)
  GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN admission_no ELSE NULL END) VIRTUAL;

ALTER TABLE students
  ADD UNIQUE KEY uk_student_school_admission (school_id, admission_no_active);

-- After this lands, getNextAdmissionNumber's callers must treat a duplicate-
-- key error on uk_student_school_admission as "retry with the next sequence"
-- for auto-generated numbers (not for an explicitly user-supplied one, where
-- a collision is a real input error) — see src/app/api/students/full/route.ts.
