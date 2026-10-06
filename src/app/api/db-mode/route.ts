/**
 * GET  /api/db-mode  — current DB mode + whether switching is allowed + health.
 * POST /api/db-mode  — switch the active DB mode (desktop/local builds only).
 *
 * The UI uses this to show the mode badge, the health dot, and (on the packaged
 * desktop app) to flip between Online Cloud and Local Server. Hosted/serverless
 * deployments hard-force online, so POST to 'local-mysql' is refused there.
 *
 * 'local-sqlite' (DbMode's third value, DRAIS V2) IS now switchable through
 * this endpoint (Phase 7 sub-effort 22) — with a real health check
 * (sqlite-health.ts, not pools.ts's mysql2 one, which always fails for this
 * mode by design) and the SAME reauthRequired contract local-mysql already
 * uses. This does NOT mean the whole app now runs on SQLite: src/lib/db.ts's
 * ~435 query() call sites still only read mysql2 (pools.ts's
 * assertMysqlMode() still throws for 'local-sqlite', unchanged) — that
 * migration is still real Phase 8+ work. What changed is narrower and
 * verified concretely, not assumed: the AUTH boundary every page depends on
 * (getSessionSchoolId(), the login route, and now /api/auth/me too) was
 * already, or is now, mode-aware, so switching to local-sqlite and logging
 * back in genuinely works — the client then lands in the Offline Workspace
 * (/students/offline etc. — sub-effort 21), not the normal dashboard, since
 * only those five pages' OWN data fetches are SQLite-aware. Any other page a
 * user navigates to by hand while in this mode will still show broken data
 * (its routes call query() same as always) — that's the one honest,
 * documented boundary of what "switchable" means here.
 *
 * The Offline Workspace routes (src/app/api/{students,staff,attendance,
 * academics,reports}/offline/**) still do NOT depend on this endpoint or on
 * getDbMode() for their OWN data access — they gate on isLocalAllowed() and
 * always read/write SQLite directly via createSqliteRepos(), regardless of
 * what this endpoint's global mode is set to. That's why visiting them was
 * already safe before this sub-effort; this sub-effort is what makes
 * actually switching INTO this mode, and being recognized as logged in once
 * there, work too.
 *
 * No DB credentials are ever returned — only the mode label, host, db name and
 * a boolean health. GET is public so the login screen can show health before
 * authentication.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode, setDbMode, isLocalAllowed, describeMode, type DbMode } from '@/lib/db/db-mode';
import { healthCheck, resetPool } from '@/lib/db/pools';
import { healthCheckSqlite } from '@/lib/db/sqlite-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const mode = getDbMode();
  const allowLocal = isLocalAllowed();

  // Cheap existence check only — never opens/creates the file. Lets the
  // login screen tell "switching to an already-set-up local install"
  // (just switch) apart from "first time, nothing here yet" (offer the
  // /setup/local-sqlite flow instead of silently creating an empty shell
  // the user never chose). better-sqlite3 itself isn't touched here, so
  // this is safe even where that optional dependency isn't installed.
  let sqliteFileExists = false;
  if (allowLocal) {
    try {
      const { existsSync } = await import('node:fs');
      const { defaultSqlitePath } = await import('@/lib/repo/sqlite/singleton');
      sqliteFileExists = existsSync(defaultSqlitePath());
    } catch { /* treat as not-yet-set-up */ }
  }

  return NextResponse.json({
    ...describeMode(mode),
    allowLocal,
    health: null,
    otherHealth: null,
    sqliteFileExists,
  });
}

export async function POST(req: NextRequest) {
  let body: { mode?: DbMode } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const target = body.mode;
  if (target !== 'online' && target !== 'local-mysql' && target !== 'local-sqlite') {
    return NextResponse.json({ error: "mode must be 'online', 'local-mysql' or 'local-sqlite'" }, { status: 400 });
  }

  // Hosted deployments are already forced online; selecting Online is a no-op.
  if (!isLocalAllowed() && target === 'online') {
    return NextResponse.json({ ...describeMode('online'), allowLocal: false, health: null, reauthRequired: false });
  }
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { error: 'DB mode switching is disabled on this deployment (online only).' },
      { status: 403 },
    );
  }

  // Probe the target BEFORE committing the switch so we don't strand the app on
  // an unreachable DB. resetPool first to force a fresh probe (no-op for
  // local-sqlite — pools.ts's cache never holds that key).
  resetPool(target);
  const health = target === 'local-sqlite' ? await healthCheckSqlite() : await healthCheck(target);
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
