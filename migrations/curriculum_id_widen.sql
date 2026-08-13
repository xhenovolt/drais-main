-- curriculums.id was TINYINT (max 127) while TiDB's auto-increment allocator
-- had already advanced past 150,000. Every INSERT overflowed and failed with
-- ER_DATA_OUT_OF_RANGE, so creating a curriculum was impossible for every
-- school, always — the UI was never at fault.
--
-- Widening the primary key alone is not enough: new ids are 150,006+, which
-- still overflows the TINYINT foreign-key columns, so a curriculum could be
-- created and then not assigned to anything. All three referencing columns
-- are widened with it.
--
-- Applied to production 2026-08-13. Safe and non-destructive — widening an
-- integer column preserves every existing value.

ALTER TABLE curriculums          MODIFY COLUMN id            BIGINT NOT NULL AUTO_INCREMENT;
ALTER TABLE enrollments          MODIFY COLUMN curriculum_id BIGINT NULL;
ALTER TABLE student_curriculums  MODIFY COLUMN curriculum_id BIGINT NULL;
ALTER TABLE classes              MODIFY COLUMN curriculum_id BIGINT NULL;
