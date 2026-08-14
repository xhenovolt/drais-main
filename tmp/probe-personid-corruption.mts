/**
 * Probe: attendance_raw_events rows whose person_id is NOT a valid people.id
 * for their role — the signature of the old raw-event-backfill bug that
 * wrote the staff/students ROW id into person_id. Read-only.
 */
const { query, pool } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/db.ts');

const bad = (await query(
  `SELECT ar.school_id, ar.role_type, ar.person_id, COUNT(*) AS n,
          MIN(ar.punch_at) AS first_seen, MAX(ar.punch_at) AS last_seen
     FROM attendance_raw_events ar
     LEFT JOIN people p ON p.id = ar.person_id
    WHERE ar.person_id IS NOT NULL AND p.id IS NULL
    GROUP BY ar.school_id, ar.role_type, ar.person_id
    ORDER BY n DESC LIMIT 30`, [],
)) as any[];
console.log('rows whose person_id matches NO people row:', bad.length ? '' : 'NONE');
for (const b of bad) console.log(b);

// Subtler case: person_id exists in people but doesn't belong to the mapped role row.
const mismatch = (await query(
  `SELECT ar.school_id, COUNT(*) AS n
     FROM attendance_raw_events ar
     JOIN staff st ON st.id = ar.role_ref_id AND st.school_id = ar.school_id
    WHERE ar.role_type = 'staff' AND ar.person_id IS NOT NULL
      AND ar.person_id <> st.person_id
    GROUP BY ar.school_id`, [],
)) as any[];
console.log('staff rows where person_id ≠ staff.person_id:', mismatch.length ? '' : 'NONE');
for (const m of mismatch) console.log(m);

const mismatchStu = (await query(
  `SELECT ar.school_id, COUNT(*) AS n
     FROM attendance_raw_events ar
     JOIN students s ON s.id = ar.role_ref_id AND s.school_id = ar.school_id
    WHERE ar.role_type = 'student' AND ar.person_id IS NOT NULL
      AND ar.person_id <> s.person_id
    GROUP BY ar.school_id`, [],
)) as any[];
console.log('student rows where person_id ≠ students.person_id:', mismatchStu.length ? '' : 'NONE');
for (const m of mismatchStu) console.log(m);

await pool.end().catch(() => {});
process.exit(0);
