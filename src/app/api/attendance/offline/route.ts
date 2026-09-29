/**
 * GET /api/attendance/offline?date=YYYY-MM-DD — every evaluated attendance
 * row for one school-day plus a status-count summary, for the first
 * offline-attendance slice (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md
 * Phase 7, sub-effort 12). A genuinely new route, not a mode-branch on the
 * real /api/attendance/history route (far too large/coupled to safely graft
 * into — see the sub-effort 12 writeup). Only meaningful in local-sqlite
 * mode; refuses cleanly otherwise.
 *
 * Dynamic import, matching every prior offline route's own discipline —
 * keeps better-sqlite3 out of this route's module graph unless it's
 * actually invoked in local-sqlite mode.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  if (getDbMode() !== 'local-sqlite') return notOfflineResponse();
  const { handleForDate } = await import('@/lib/repo/offline-attendance/route-bridge');
  return handleForDate(request);
}
