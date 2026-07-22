/**
 * Device name-integrity repair + identity reconciliation (one device).
 *
 *   npx tsx scripts/db/repair-device-name-integrity.ts --sn GED7254601154 \
 *       --school 12004 [--ip 192.168.1.17] [--apply]
 *
 * Fixes the JIPRA "attendance logs without names" defect (2026-07-23):
 * the Phase-0 tenancy fix moved the devices row to the right school but
 * device_user_directory rows stayed under the OLD school, so display-name
 * resolution and identity matching (both school-scoped) went blind.
 *
 * Steps (dry-run by default, --apply to execute):
 *   A. Move device_user_directory rows for the SN to the owning school
 *      (uk_dud is (sn, pin) — no collision possible). Backed up first.
 *   B. Backfill attendance_raw_events.display_name from the directory
 *      for nameless rows — "the name on the device is the name in DRAIS".
 *   C. Try a live TCP inventory for the freshest device truth (falls back
 *      to the cached directory when the LAN is unreachable).
 *   D. Run the identity-matching engine; auto-confirm ONLY uncontested
 *      ≥90% matches; print the review tier for the admin UI.
 *   E. For every confirmed mapping, retro-claim historical punches
 *      (backfillAttendanceRawEventsForMapping) and re-evaluate the
 *      affected days so derived attendance + the allowance report see
 *      the names.
 *   F. Verify: nameless / unmatched counts before vs after.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { query } from '@/lib/db';
import { runDeviceUserMatching, confirmMatch } from '@/lib/biometric/identity/device-user-sync';
import { backfillAttendanceRawEventsForMapping } from '@/lib/attendance/raw-event-backfill';
import { evaluateDay } from '@/lib/attendance/engine';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
};
const APPLY = process.argv.includes('--apply');
const SN = arg('sn') || 'GED7254601154';
const SCHOOL = parseInt(arg('school') || '12004', 10);
const IP = arg('ip'); // optional — live TCP pull when reachable

async function counts() {
  const [r] = (await query(
    `SELECT COUNT(*) c, SUM(display_name IS NULL) nameless, SUM(matched=0) unmatched
       FROM attendance_raw_events WHERE school_id=? AND device_sn=?`,
    [SCHOOL, SN],
  )) as Array<{ c: number; nameless: number; unmatched: number }>;
  return { total: Number(r.c), nameless: Number(r.nameless), unmatched: Number(r.unmatched) };
}

async function main() {
  console.log(`Device ${SN} → school ${SCHOOL} ${APPLY ? '(APPLY)' : '(dry run)'}`);
  const before = await counts();
  console.log('before:', JSON.stringify(before));

  // ── A. Directory tenancy ────────────────────────────────────────────
  const misplaced = (await query(
    `SELECT COUNT(*) c FROM device_user_directory WHERE device_sn=? AND school_id<>?`,
    [SN, SCHOOL],
  )) as Array<{ c: number }>;
  console.log(`directory rows under wrong school: ${misplaced[0].c}`);
  if (APPLY && Number(misplaced[0].c) > 0) {
    const rows = await query(
      `SELECT * FROM device_user_directory WHERE device_sn=? AND school_id<>?`, [SN, SCHOOL]);
    const dir = path.resolve(process.cwd(), `backups/device-directory-${SN}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'directory.before.json'), JSON.stringify(rows, null, 1));
    const upd = (await query(
      `UPDATE device_user_directory SET school_id=? WHERE device_sn=? AND school_id<>?`,
      [SCHOOL, SN, SCHOOL],
    )) as { affectedRows?: number };
    console.log(`✔ directory tenancy: ${upd.affectedRows} row(s) → school ${SCHOOL} (backup: ${dir})`);
  }

  // ── B. Nameless display_name backfill from the directory ────────────
  if (APPLY) {
    const upd = (await query(
      `UPDATE attendance_raw_events ar
         JOIN device_user_directory dud
           ON dud.device_sn = ar.device_sn
          AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
          SET ar.display_name = dud.device_name
        WHERE ar.school_id = ? AND ar.device_sn = ?
          AND ar.display_name IS NULL
          AND dud.device_name IS NOT NULL AND dud.device_name NOT LIKE 'PIN %'`,
      [SCHOOL, SN],
    )) as { affectedRows?: number };
    console.log(`✔ display_name backfill: ${upd.affectedRows} nameless event(s) named from the device directory`);
  }

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to execute A/B and the matching below.');
    process.exit(0);
  }

  // ── C+D. Matching (live TCP when IP given/reachable; else directory) ─
  const report = await runDeviceUserMatching({
    schoolId: SCHOOL, deviceSn: SN, lanIp: IP, actorUserId: null,
  });
  console.log(`match run [${report.source}]: onDevice=${report.usersOnDevice} alreadyMapped=${report.alreadyMapped} auto=${report.auto} review=${report.review} unmatched=${report.unmatched}`);
  for (const w of report.warnings) console.log(`  ⚠ ${w}`);

  // Auto-confirm ONLY uncontested ≥90% suggestions.
  let confirmed = 0;
  const confirmedPins: Array<{ pin: string; staffId: number; name: string }> = [];
  for (const it of report.items) {
    if (it.tier !== 'auto' || it.contested || !it.best) continue;
    const res = await confirmMatch({
      schoolId: SCHOOL, deviceSn: SN, pin: it.device.pin,
      roleType: it.best.roleType, refId: it.best.refId, actorUserId: null,
    });
    if (res.ok) {
      confirmed++;
      confirmedPins.push({ pin: it.device.pin, staffId: it.best.refId, name: it.best.name });
      console.log(`✔ mapped PIN ${it.device.pin} "${it.device.name}" → ${it.best.name} (${it.best.confidence}%)`);
    } else {
      console.log(`• PIN ${it.device.pin}: not mapped — ${res.reason}`);
    }
  }

  // ── E. Retro-claim historical punches for the new mappings ──────────
  let claimed = 0, daysReevaluated = 0;
  for (const m of confirmedPins) {
    const bf = await backfillAttendanceRawEventsForMapping({
      schoolId: SCHOOL, deviceUserId: m.pin, deviceSn: SN, staffId: m.staffId,
    });
    claimed += bf.affectedRows;
    const staffPerson = (await query(
      `SELECT person_id FROM staff WHERE id=? LIMIT 1`, [m.staffId],
    )) as Array<{ person_id: number }>;
    const personId = staffPerson[0]?.person_id;
    if (personId) {
      for (const d of bf.affectedDates) {
        try { await evaluateDay(SCHOOL, personId, 'staff', d); daysReevaluated++; } catch { /* re-runnable */ }
      }
    }
  }
  console.log(`✔ retro-claimed ${claimed} historical punch(es); re-evaluated ${daysReevaluated} person-day(s)`);

  // Review tier for the admin.
  const review = report.items.filter(i => i.tier === 'review' && i.best);
  if (review.length) {
    console.log(`\nNEEDS ADMIN REVIEW (${review.length}) — confirm at /attendance/identity-matching:`);
    for (const it of review) {
      console.log(`  PIN ${it.device.pin} "${it.device.name}" → ${it.best!.name} (${it.best!.confidence}%${it.contested ? ', contested' : ''})`);
    }
  }
  const unmatchedItems = report.items.filter(i => i.tier === 'unmatched');
  if (unmatchedItems.length) {
    console.log(`\nUNMATCHED (${unmatchedItems.length}):`);
    for (const it of unmatchedItems) console.log(`  PIN ${it.device.pin} "${it.device.name}"`);
  }

  const after = await counts();
  console.log('\nafter:', JSON.stringify(after));
  console.log(`nameless ${before.nameless} → ${after.nameless}; unmatched ${before.unmatched} → ${after.unmatched}; mappings confirmed: ${confirmed}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
