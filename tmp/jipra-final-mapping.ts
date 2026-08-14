import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { confirmMatch } from '@/lib/biometric/identity/device-user-sync';
import { backfillAttendanceRawEventsForMapping } from '@/lib/attendance/raw-event-backfill';
import { evaluateDay } from '@/lib/attendance/engine';

const SCHOOL = 12004, SN = 'GED7254601154';

async function retroClaim(pin: string, staffId: number) {
  const bf = await backfillAttendanceRawEventsForMapping({ schoolId: SCHOOL, deviceUserId: pin, deviceSn: SN, staffId });
  const p = (await query(`SELECT person_id FROM staff WHERE id=?`, [staffId])) as Array<{ person_id: number }>;
  let days = 0;
  if (p[0]?.person_id) {
    for (const d of bf.affectedDates) {
      const day = d instanceof Date ? d : new Date(d);
      try { await evaluateDay(SCHOOL, p[0].person_id, 'staff', day); days++; } catch { /* rerunnable */ }
    }
  }
  return { punches: bf.affectedRows, days };
}

async function main() {
  // ── 1. Confirm the 5 operator-approved review suggestions ────────────
  const reviews = (await query(
    `SELECT device_pin, device_name, candidate_ref_id, candidate_name, confidence
       FROM biometric_match_suggestions
      WHERE school_id=? AND device_sn=? AND status='pending' AND tier='review' AND match_rank=0
        AND candidate_ref_id IS NOT NULL`,
    [SCHOOL, SN],
  )) as Array<{ device_pin: string; device_name: string; candidate_ref_id: number; candidate_name: string; confidence: number }>;
  for (const r of reviews) {
    const res = await confirmMatch({ schoolId: SCHOOL, deviceSn: SN, pin: r.device_pin, roleType: 'staff', refId: r.candidate_ref_id, actorUserId: null });
    if (res.ok) {
      const rc = await retroClaim(r.device_pin, r.candidate_ref_id);
      console.log(`✔ review confirmed PIN ${r.device_pin} "${r.device_name}" → ${r.candidate_name} (${r.confidence}%) — ${rc.punches} punches claimed, ${rc.days} days evaluated`);
    } else console.log(`• review PIN ${r.device_pin}: ${res.reason}`);
  }

  // ── 2. Create the missing staff (device name = the name) and map ────
  const CREATE: Array<{ pin: string; first: string; other: string | null; last: string }> = [
    { pin: '157', first: 'NTAMB', other: null, last: 'ABDALLAH' },
    { pin: '160', first: 'MUTANDA', other: null, last: 'JAMES' },
    { pin: '162', first: 'MATEGE', other: null, last: 'STEPHEN' },
    { pin: '164', first: 'O', other: 'JOHN', last: 'BOSCO' },
    { pin: '166', first: 'KARIMU', other: null, last: '' },
  ];
  const posRows = (await query(`SELECT id FROM positions WHERE code='other_staff' AND school_id IS NULL LIMIT 1`, [])) as Array<{ id: number }>;
  const positionId = posRows[0]?.id ?? null;
  for (const s of CREATE) {
    // Skip if an identical staff name already exists (idempotent re-run).
    const existing = (await query(
      `SELECT st.id FROM staff st JOIN people p ON p.id=st.person_id
        WHERE st.school_id=? AND st.deleted_at IS NULL
          AND UPPER(TRIM(CONCAT_WS(' ', p.first_name, p.other_name, p.last_name))) = ?`,
      [SCHOOL, [s.first, s.other, s.last].filter(Boolean).join(' ').toUpperCase()],
    )) as Array<{ id: number }>;
    let staffId: number;
    if (existing.length) {
      staffId = existing[0].id;
      console.log(`• staff already exists for ${s.first} ${s.last} (id ${staffId})`);
    } else {
      const pr = (await query(
        `INSERT INTO people (school_id, first_name, last_name, other_name) VALUES (?, ?, ?, ?)`,
        [SCHOOL, s.first, s.last, s.other],
      )) as { insertId: number };
      const staffNo = `STAFF${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const sr = (await query(
        `INSERT INTO staff (school_id, person_id, staff_no, position_id, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [SCHOOL, pr.insertId, staffNo, positionId],
      )) as { insertId: number };
      staffId = sr.insertId;
      console.log(`✔ created staff ${[s.first, s.other, s.last].filter(Boolean).join(' ')} (staff ${staffId}, ${staffNo})`);
    }
    const res = await confirmMatch({ schoolId: SCHOOL, deviceSn: SN, pin: s.pin, roleType: 'staff', refId: staffId, actorUserId: null });
    if (res.ok) {
      const rc = await retroClaim(s.pin, staffId);
      console.log(`✔ mapped PIN ${s.pin} → staff ${staffId} — ${rc.punches} punches claimed, ${rc.days} days evaluated`);
    } else console.log(`• PIN ${s.pin} map: ${res.reason}`);
  }

  // ── 3. Final state ──────────────────────────────────────────────────
  const [after] = (await query(
    `SELECT COUNT(*) c, SUM(display_name IS NULL) nameless, SUM(matched=0) unmatched
       FROM attendance_raw_events WHERE school_id=? AND device_sn=?`, [SCHOOL, SN],
  )) as Array<{ c: number; nameless: number; unmatched: number }>;
  console.log('final raw-events state:', JSON.stringify(after));
  const [enr] = (await query(
    `SELECT COUNT(*) c FROM biometric_enrollments WHERE school_id=? AND status='active'`, [SCHOOL],
  )) as Array<{ c: number }>;
  console.log('active JIPRA enrollments:', enr[0]?.c ?? enr);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
