import { NextRequest, NextResponse } from 'next/server';
import { getAllTerms } from '@/lib/terms';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveTermContext } from '@/lib/academic/term-resolver';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { getDbMode } from '@/lib/db/db-mode';

/**
 * local-sqlite branch — Phase 7 sub-effort 32, same §25a pattern.
 * Deliberately simplified: the real `context` carries
 * effective/upcoming/previous/progress/warnings from resolveTermContext()
 * + resolveTimePolicy() (device-clock-aware), real complexity this branch
 * doesn't replicate. `context.progress`/`.upcoming`/`.previous` stay null
 * — the Enroll page's own term-progress banner already guards on them
 * being present (`{termContext.progress && (...)}`) so this degrades to
 * "no progress bar shown" rather than a crash. `current` itself (the one
 * value every caller actually depends on to pick a default term) is real,
 * via the already-built getCurrentTermOffline().
 */
async function offlineGetCurrentTerm(schoolId: number) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const { getCurrentTermOffline } = await import('@/lib/terms-offline');
  const db = getSqliteDb();
  const current = getCurrentTermOffline(db, schoolId);
  const all = db.prepare(`
    SELECT t.*, ay.name AS academic_year_name FROM terms t
    JOIN academic_years ay ON t.academic_year_id = ay.id
    WHERE t.school_id = ? AND t.deleted_at IS NULL
    ORDER BY ay.start_date DESC, t.start_date ASC
  `).all(schoolId);
  return NextResponse.json({
    success: true,
    data: { current, all, context: { effective: current, upcoming: null, previous: null, progress: null, warnings: [] } },
  });
}

/**
 * GET /api/terms/current
 * Canonical current-term endpoint. `data.current` is now DATE-DRIVEN via the
 * term resolver (null when today is outside every term), not the old
 * "latest is_active term" which returned a stale past term forever.
 * `data.context` carries effective/upcoming/previous/progress/warnings.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;
  if (getDbMode() === 'local-sqlite') return offlineGetCurrentTerm(schoolId);

  try {
    const policy = await resolveTimePolicy(schoolId);
    const [context, all] = await Promise.all([
      resolveTermContext(schoolId, policy.offsetMinutes),
      getAllTerms(schoolId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        current: context.effective,   // date-driven; null if no current term
        all,
        context,                      // { effective, upcoming, previous, progress, warnings, ... }
      },
    });
  } catch (err) {
    console.error('[terms/current] error:', err);
    return NextResponse.json({ error: 'Failed to fetch terms' }, { status: 500 });
  }
}
