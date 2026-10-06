/**
 * Next.js server-boot hook — runs exactly once, before the server accepts
 * any request (dev, `next start`, and the standalone server Electron
 * requires in-process all call this the same way).
 *
 * The one job here: close the real gap between how TiDB and local-sqlite
 * reach "works from the very first launch, zero clicks". TiDB gets there
 * because credentials can be baked into build/.env.production — the exe
 * boots straight into a working login screen, no setup UI ever shown.
 * Before this hook existed, local-sqlite had no equivalent: even a school
 * bundled at build time (scripts/build/prepare-drs-bundle.mjs) still
 * needed an admin to open the app, choose "Local Server (SQLite)", and
 * click one button on /setup/local-sqlite before any data existed.
 *
 * If exactly one bundled entry was marked autoActivate (the build script
 * asks this when bundling), and this machine has no local database yet,
 * decrypt and install it SILENTLY here — by the time the login screen
 * renders, DRAIS_DB_MODE is already 'local-sqlite' and the data already
 * exists, identical in spirit to how TiDB creds already being in env
 * make that mode "just work" with no setup screen.
 *
 * Must never throw: a failure here falls through to today's behavior
 * (the setup page still offers this same school for a one-click, not
 * zero-click, install) rather than crashing server boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { isLocalAllowed } = await import('@/lib/db/db-mode');
    if (!isLocalAllowed()) return; // hosted/serverless — this hook is a no-op there

    const { findAutoActivateSchool } = await import('@/lib/desktop/drs-bundle');
    const auto = findAutoActivateSchool();
    if (!auto) return; // nothing to auto-activate — normal case for most builds

    const { defaultSqlitePath } = await import('@/lib/repo/sqlite/singleton');
    const fs = await import('node:fs');
    if (fs.existsSync(defaultSqlitePath())) {
      // Already set up (a prior boot already auto-activated it, or the
      // admin already ran a manual setup) — never silently overwrite
      // real data on every restart.
      return;
    }

    console.log(`[instrumentation] Auto-activating bundled school "${auto.schoolName}" — zero-click first boot.`);
    const { openDrsFile, readDrsHeader } = await import('@/lib/container/read-drs');
    const header = await readDrsHeader(auto.filePath);
    if (header.engine !== 'sqlite') {
      console.error(`[instrumentation] Auto-activate skipped: bundled .drs engine is '${header.engine}', not 'sqlite'.`);
      return;
    }
    const { payload } = await openDrsFile(auto.filePath, auto.passphrase);
    const { installDrsPayload } = await import('@/lib/desktop/install');
    const result = await installDrsPayload(payload, false);
    console.log(`[instrumentation] Auto-activate complete — installed at ${result.installedAt}. Mode is now local-sqlite.`);

    // Also force the mode live for THIS already-running process — applyConfig
    // inside installDrsPayload already set process.env.DRAIS_DB_MODE, but
    // setDbMode() additionally clears the runtime-override cache so getDbMode()
    // reflects it immediately rather than only after the next cold start.
    const { setDbMode } = await import('@/lib/db/db-mode');
    setDbMode('local-sqlite');
  } catch (err) {
    console.error('[instrumentation] Auto-activate failed (non-fatal, falling back to the setup screen):', err);
  }
}
