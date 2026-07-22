/**
 * DRAIS — nodejs-mobile entrypoint.
 *
 * This script runs inside the embedded Node.js runtime that
 * nodejs-mobile-cordova ships in the APK. The APK's startup sequence
 * is:
 *
 *   1. Capacitor's MainActivity starts.
 *   2. nodejs-mobile spawns its Node runtime and runs THIS file.
 *   3. We require .next/standalone/server.js after setting PORT and
 *      HOSTNAME, mirroring the Electron main process (electron/main.cjs).
 *   4. The standalone server listens on 127.0.0.1:3210.
 *   5. capacitor.config.ts has `server.url = http://127.0.0.1:3210`,
 *      so the WebView swaps from the splash placeholder to the live
 *      Next.js app as soon as it answers.
 *
 * Bundling: scripts/build-mobile.mjs copies the Next standalone tree
 * (.next/standalone/**) into mobile/nodejs-project/ before running
 * `cap sync`, so by the time Cordova's plugin packs the assets there
 * is a complete server.js + .next + public + node_modules right next
 * to this file.
 *
 * Constraints to be aware of:
 *   - nodejs-mobile is Node 18.x (currently). Next 15 wants 18.18+;
 *     in practice it runs but watch for `globalThis.crypto.subtle`
 *     warnings on older Node 18 patch releases.
 *   - Native node_modules (e.g. mysql2's mysql_native_password binding)
 *     must be cross-compiled for Android ABIs. The mysql2 fallback is
 *     pure JS so DRAIS works without the native binding — just slower
 *     auth on first connect.
 *   - Filesystem under nodejs-project/ inside the APK is read-only.
 *     Anything Next.js wants to write at runtime (cache, telemetry)
 *     must be redirected to the app's writable directory; we set
 *     NEXT_TELEMETRY_DISABLED + a HOME override below.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const PORT = 3210;

// ── Boot beacons ──────────────────────────────────────────────────────
// Every boot stage is pushed to the WebView over the cordova-bridge
// channel so the "Starting DRAIS" screen can show REAL progress and REAL
// failures instead of an opaque spinner. Also mirrored to logcat.
let __bridge = null;
try { __bridge = require('cordova-bridge'); } catch (e) { /* not under nodejs-mobile */ }
function beacon(stage, detail) {
  const msg = { drais: true, stage, detail: detail == null ? '' : String(detail), t: Date.now() };
  try { __bridge && __bridge.channel && __bridge.channel.send(JSON.stringify(msg)); } catch (e) { /* channel not up yet */ }
  console.log('[drais][boot] ' + stage + (msg.detail ? ' — ' + msg.detail : ''));
}
// Surface async crashes instead of dying silently: the boot screen shows
// the message, the runtime stays up so the operator can read it.
process.on('uncaughtException', (e) => {
  beacon('uncaught-exception', e && e.stack ? e.stack.split('\n')[0] : e);
});
process.on('unhandledRejection', (e) => {
  beacon('unhandled-rejection', e && e.message ? e.message : e);
});

beacon('node-started', 'Node ' + process.version);

// Tell Next + Node not to touch the read-only project root. The
// nodejs-mobile API exposes a writable data dir via cordova; we
// fall back to /data/local/tmp which is writable on most Android
// configurations even outside the Cordova plugin context.
const writableHome =
  (typeof process.env.NODEJS_MOBILE_DATA_DIR === 'string' && process.env.NODEJS_MOBILE_DATA_DIR) ||
  '/data/local/tmp';

// ── DB / runtime config, mirroring electron/config.cjs ────────────────
// Sources (earlier wins, existing process.env always wins):
//   1. drais.env in the writable data dir — admin-editable on the device
//   2. .env.production bundled next to main.js — staged by
//      scripts/build-mobile.mjs from build/.env.production when the
//      operator provides one (same file electron-builder bundles).
// Without either, the embedded server still boots but DB-backed routes
// have no TiDB credentials — same failure mode as an unconfigured desktop.
function loadEnvFile(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || m[1].startsWith('#')) continue;
      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
    return true;
  } catch { return false; }
}
// NOTE: bundled as 'env.production' (no leading dot) — the android
// aaptOptions.ignoreAssetsPattern contains `.*`, which silently strips
// every dotfile from APK assets.
const envUser    = loadEnvFile(path.join(writableHome, 'drais.env'));
const envBundled = loadEnvFile(path.join(__dirname, 'env.production'));
beacon('env-loaded', 'device drais.env=' + envUser + ', bundled env.production=' + envBundled);

process.env.PORT     = String(PORT);
process.env.HOSTNAME = '127.0.0.1';
process.env.NODE_ENV = 'production';
process.env.HOME     = writableHome;
process.env.NEXT_TELEMETRY_DISABLED = '1';

const serverEntry = path.join(__dirname, 'server.js');
if (!fs.existsSync(serverEntry)) {
  beacon('server-missing', serverEntry);
  // Keep the runtime alive so the boot screen keeps showing the error
  // instead of the app appearing to crash silently.
  setInterval(() => {}, 60_000);
  return;
}

// The standalone server expects to run from its own directory because
// it does `require('./.next/server/...')` with relative paths.
process.chdir(__dirname);

try {
  beacon('server-starting', '127.0.0.1:' + PORT);
  require(serverEntry);
} catch (err) {
  beacon('server-crash', err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err);
  // Don't let the runtime exit — the boot screen displays the crash.
  setInterval(() => {}, 60_000);
}
