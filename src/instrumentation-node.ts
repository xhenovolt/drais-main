/**
 * Node-only body of the server-boot hook (see src/instrumentation.ts for what it does and why).
 * Kept in its own module so the edge compile of instrumentation never sees node:crypto/node:fs —
 * importing those from instrumentation.ts directly broke every webpack build (next dev, build:electron)
 * with "Reading from node:crypto is not handled by plugins".
 */
export async function registerNode() {
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
