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
  // Static NEXT_RUNTIME check: webpack drops this branch from the edge bundle entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
  }
}
