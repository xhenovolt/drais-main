/**
 * GET/POST /api/students/offline — list/create students for the first
 * offline-students slice (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md
 * Phase 7 sub-effort 11). A genuinely new route, not a mode-branch on any
 * existing student route — the real /students/list feature is far too
 * large/coupled to safely graft an offline branch into (see the sub-effort
 * 11 writeup for why). Only meaningful in local-sqlite mode; refuses
 * cleanly otherwise rather than doing something undefined against the
 * wrong database.
 *
 * Dynamic import, matching auth.ts/the login route's own discipline —
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
  const { handleList } = await import('@/lib/repo/offline-students/route-bridge');
  return handleList(request);
}

export async function POST(request: NextRequest) {
  if (getDbMode() !== 'local-sqlite') return notOfflineResponse();
  const { handleCreate } = await import('@/lib/repo/offline-students/route-bridge');
  return handleCreate(request);
}
