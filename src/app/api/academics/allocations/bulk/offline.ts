import { NextResponse } from 'next/server';
import { validateAllocationInput as validateInput } from '@/lib/allocation-validation';

/**
 * local-sqlite branch — Phase 7 sub-effort 42, same §25a pattern as the
 * parent allocations route's own offline.ts. Deliberately mirrors the
 * online bulk route's own inconsistency (plain update-or-insert, no
 * valid_from/valid_to history) rather than "fixing" it here — the two
 * backends must keep producing the SAME answer, even an imperfect one;
 * see docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md's sub-effort 42
 * entry for the online route's own inconsistency, named but not changed.
 */
async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

function assertOwnership(sdb: any, schoolId: number, class_id: number, subject_id: number, teacher_id: number | null): string | null {
  const cls = sdb.prepare(`SELECT id FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).get(class_id, schoolId);
  if (!cls) return 'The selected class does not belong to your school.';
  const subj = sdb.prepare(`SELECT id FROM subjects WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).get(subject_id, schoolId);
  if (!subj) return 'The selected subject does not belong to your school.';
  if (teacher_id) {
    const staff = sdb.prepare(`SELECT id FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).get(teacher_id, schoolId);
    if (!staff) return 'The selected teacher does not belong to your school.';
  }
  return null;
}

export async function offlineBulkAllocate(schoolId: number, allocations: any[]) {
  const sdb = await db();
  const results: any[] = [];
  const errors: string[] = [];

  // The online route rolls back the WHOLE transaction when any row fails,
  // discarding rows that individually succeeded — mirrored here by
  // collecting per-row errors, then throwing once at the end so
  // better-sqlite3's transaction() auto-rollbacks exactly like the online
  // route's explicit connection.rollback() does.
  const run = sdb.transaction(() => {
    for (let i = 0; i < allocations.length; i++) {
      const item = allocations[i];
      try {
        const { class_id, subject_id, teacher_id, custom_initials } = validateInput(item);
        const ownershipError = assertOwnership(sdb, schoolId, class_id, subject_id, teacher_id);
        if (ownershipError) throw new Error(ownershipError);

        const existing = sdb.prepare(
          `SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?`
        ).get(class_id, subject_id) as { id: number } | undefined;

        if (existing) {
          sdb.prepare(`UPDATE class_subjects SET teacher_id = ?, custom_initials = ? WHERE id = ?`)
            .run(teacher_id, custom_initials, existing.id);
          results.push({ action: 'updated', id: existing.id, class_id, subject_id });
        } else {
          const result = sdb.prepare(
            `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials) VALUES (?, ?, ?, ?)`
          ).run(class_id, subject_id, teacher_id, custom_initials);
          results.push({ action: 'created', id: result.lastInsertRowid, class_id, subject_id });
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }
    if (errors.length > 0) throw new Error('__BULK_ROLLBACK__');
  });

  try {
    run();
  } catch (e: any) {
    if (e.message !== '__BULK_ROLLBACK__') throw e;
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, message: 'Bulk operation failed', errors }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: `Bulk operation completed: ${results.filter(r => r.action === 'created').length} created, ${results.filter(r => r.action === 'updated').length} updated`,
    data: results,
  });
}
