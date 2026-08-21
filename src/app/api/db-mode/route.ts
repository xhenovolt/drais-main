/**
 * GET  /api/db-mode  — current DB mode + whether switching is allowed + health.
 * POST /api/db-mode  — switch the active DB mode (desktop/local builds only).
 *
 * The UI uses this to show the mode badge, the health dot, and (on the packaged
 * desktop app) to flip between Online Cloud and Local Server. Hosted/serverless
 * deployments hard-force online, so POST to 'local-mysql' is refused there.
 *
 * 'local-sqlite' (DbMode's third value, DRAIS V2) is DELIBERATELY not
 * switchable through this endpoint yet, even though db-mode.ts/pools.ts
 * already know about it defensively. Switching a running session into
 * local-sqlite here would silently break every one of src/lib/db.ts's
 * ~435 query() call sites — none of them read SQLite, and none have been
 * migrated to the @drais/repo-sqlite-backed Repos abstraction
 * (src/lib/repo/resolve.ts) yet. That migration is Phase 8+ work
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §25); this endpoint
 * gets a third option only once there's a real page behind it, not before.
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
  // healthCheck() (pools.ts) is genuinely never-throwing, including for a
  // non-mysql mode like 'local-sqlite' — it returns {ok:false, ...} rather
  // than probing a pool that doesn't exist for that mode. `mode` itself
  // can't actually BE 'local-sqlite' here today anyway (see POST's guard;
  // nothing reachable through this app sets runtimeMode to it), but this
  // call is safe regardless.
  const health = await healthCheck(mode);
  // On desktop, also surface the other mode's reachability for the selector.
  const other: DbMode = mode === 'online' ? 'local-mysql' : 'online';
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
  // 'local-sqlite' intentionally excluded — see this file's header.
  if (target !== 'online' && target !== 'local-mysql') {
    return NextResponse.json({ error: "mode must be 'online' or 'local-mysql'" }, { status: 400 });
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
