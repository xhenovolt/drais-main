-- 006 — Phase 1F data backfill on zk_user_mapping (idempotent).
-- The resolver no longer accepts school_id IS NULL rows for
-- attribution; this fills school_id where it is safely inferable.
-- Rows that remain NULL after this stay unmatched and surface in the
-- pending reconciliation queue (never guessed).

UPDATE zk_user_mapping m
JOIN devices d ON d.sn = m.device_sn
SET m.school_id = d.school_id
WHERE (m.school_id IS NULL OR m.school_id = 0)
  AND d.school_id IS NOT NULL;

UPDATE zk_user_mapping m
JOIN students s ON s.id = m.student_id
SET m.school_id = s.school_id
WHERE (m.school_id IS NULL OR m.school_id = 0)
  AND m.student_id IS NOT NULL;

UPDATE zk_user_mapping m
JOIN staff st ON st.id = m.staff_id
SET m.school_id = st.school_id
WHERE (m.school_id IS NULL OR m.school_id = 0)
  AND m.staff_id IS NOT NULL;

-- NOTE: IP-as-serial repair moved to 007_ip_as_serial_repair.mjs.
-- A blind UPDATE collides with uk_device_user (device_user_id,
-- device_sn) when a real-SN row for the same PIN already exists (the
-- Phase 1 mirror writes created those) — the first production run hit
-- exactly that. 007 handles each row collision-safely.
