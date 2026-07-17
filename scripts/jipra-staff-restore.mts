#!/usr/bin/env tsx
/**
 * JIPRA STAFF RESTORATION — Phase 1 (duplicate re-check) + Phase 2 (restore)
 * ===========================================================================
 *
 * Restores the 196 soft-deleted `staff` rows for JIPRA (school_id=12004)
 * using the canonical trash service (src/lib/trash/service.ts) so every
 * restoration goes through the same audit-logging + biometric-reactivation
 * path as a normal admin "Restore" click in the UI.
 *
 * Confirmed by the operator (2026-07-17) after reviewing
 * JIPRA_STAFF_FORENSIC_RECOVERY_REPORT.md — proceeding with full restore
 * of all 196 archived staff + verifying the 1 already-active record.
 *
 * Safety:
 *  - Re-checks for duplicates (active staff already on same person_id)
 *    immediately before each restore, in case the roster changed since
 *    the audit.
 *  - Uses restoreEntity() — never writes deleted_at/restored_at via raw SQL.
 *  - Idempotent: restoreEntity() throws NOT_ARCHIVED if a row was already
 *    restored, which we catch and record as "skipped".
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SCHOOL_ID = 12004;
const ACTOR_USER_ID = 360001; // ENOCH — the same authenticated JIPRA account that archived these

async function main() {
  const { query } = await import('@/lib/db');
  const { restoreEntity, TrashError } = await import('@/lib/trash/service');

  const archived = await query(
    `SELECT id, person_id, staff_no FROM staff WHERE school_id = ? AND deleted_at IS NOT NULL ORDER BY id ASC`,
    [SCHOOL_ID],
  );

  console.log(`Found ${archived.length} archived staff rows for school_id=${SCHOOL_ID}`);

  const results: any[] = [];
  let restored = 0, skippedDuplicate = 0, skippedNotArchived = 0, failed = 0;

  for (const row of archived) {
    try {
      // Duplicate re-check: is there ALREADY an active staff row for this person_id?
      const dup = await query(
        `SELECT id FROM staff WHERE school_id = ? AND person_id = ? AND deleted_at IS NULL AND id != ?`,
        [SCHOOL_ID, row.person_id, row.id],
      );
      if (dup.length > 0) {
        skippedDuplicate++;
        results.push({ staff_id: row.id, person_id: row.person_id, status: 'skipped_duplicate', conflictingStaffId: dup[0].id });
        console.log(`  ⚠ SKIP staff_id=${row.id} person_id=${row.person_id} — active duplicate exists (staff_id=${dup[0].id})`);
        continue;
      }

      const out = await restoreEntity({
        entity:   'staff',
        id:       row.id,
        schoolId: SCHOOL_ID,
        userId:   ACTOR_USER_ID,
        ip:       null,
        userAgent: 'jipra-staff-restore-script',
      });

      restored++;
      results.push({ staff_id: row.id, person_id: row.person_id, staff_no: row.staff_no, status: 'restored' });
      console.log(`  ✓ Restored staff_id=${out.id} (person_id=${row.person_id})`);
    } catch (err: any) {
      if (err instanceof TrashError && err.code === 'NOT_ARCHIVED') {
        skippedNotArchived++;
        results.push({ staff_id: row.id, person_id: row.person_id, status: 'skipped_not_archived' });
        console.log(`  – already active staff_id=${row.id}`);
      } else {
        failed++;
        results.push({ staff_id: row.id, person_id: row.person_id, status: 'failed', error: err?.message ?? String(err) });
        console.error(`  ✗ FAILED staff_id=${row.id}:`, err?.message ?? err);
      }
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    schoolId: SCHOOL_ID,
    actorUserId: ACTOR_USER_ID,
    totalCandidates: archived.length,
    restored,
    skippedDuplicate,
    skippedNotArchived,
    failed,
    results,
  };

  fs.writeFileSync(
    path.join(__dirname, '..', 'JIPRA_STAFF_RESTORE_RESULT.json'),
    JSON.stringify(summary, null, 2),
  );

  console.log('\n' + '='.repeat(70));
  console.log('RESTORE COMPLETE');
  console.log('='.repeat(70));
  console.log(`Total candidates:      ${archived.length}`);
  console.log(`Restored:              ${restored}`);
  console.log(`Skipped (duplicate):   ${skippedDuplicate}`);
  console.log(`Skipped (not archived):${skippedNotArchived}`);
  console.log(`Failed:                ${failed}`);
  console.log('Full results written to JIPRA_STAFF_RESTORE_RESULT.json');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
