/**
 * GET  /api/db-mode  — current DB mode + whether switching is allowed + health.
 * POST /api/db-mode  — switch the active DB mode (desktop/local builds only).
 *
 * The UI uses this to show the mode badge, the health dot, and (on the packaged
 * desktop app) to flip between Online Cloud and Local Server. Hosted/serverless
 * deployments hard-force online, so POST to 'local' is refused there.
 *
 * No DB credentials are ever returned — only the mode label, host, db name and
 * a boolean health. GET is public so the login screen can show health before
 * authentication.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode, setDbMode, isLocalAllowed, describeMode, type DbMode } from '@/lib/db/db-mode';
import { healthCheck, resetPool } from '@/lib/db/pools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const mode = getDbMode();
  const allowLocal = isLocalAllowed();
  const health = await healthCheck(mode);
  // On desktop, also surface the other mode's reachability for the selector.
  const other: DbMode = mode === 'online' ? 'local' : 'online';
  const otherHealth = allowLocal ? await healthCheck(other) : null;

  return NextResponse.json({
    ...describeMode(mode),
    allowLocal,
    health,
    otherHealth,
  });
}

export async function POST(req: NextRequest) {
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { error: 'DB mode switching is disabled on this deployment (online only).' },
      { status: 403 },
    );
  }

  let body: { mode?: DbMode } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const target = body.mode;
  if (target !== 'online' && target !== 'local') {
    return NextResponse.json({ error: "mode must be 'online' or 'local'" }, { status: 400 });
  }

  // Probe the target BEFORE committing the switch so we don't strand the app on
  // an unreachable DB. resetPool first to force a fresh probe.
  resetPool(target);
  const health = await healthCheck(target);
  if (!health.ok) {
    return NextResponse.json(
      { error: `Cannot switch: ${describeMode(target).label} is not reachable.`, health },
      { status: 502 },
    );
  }

  const mode = setDbMode(target);
  return NextResponse.json({
    ...describeMode(mode),
    allowLocal: true,
    health,
    // The session may be DB-bound; the client should sign out + reload.
    reauthRequired: true,
  });
}
