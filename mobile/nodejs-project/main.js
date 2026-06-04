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

// Tell Next + Node not to touch the read-only project root. The
// nodejs-mobile API exposes a writable data dir via cordova; we
// fall back to /data/local/tmp which is writable on most Android
// configurations even outside the Cordova plugin context.
const writableHome =
  (typeof process.env.NODEJS_MOBILE_DATA_DIR === 'string' && process.env.NODEJS_MOBILE_DATA_DIR) ||
  '/data/local/tmp';

process.env.PORT     = String(PORT);
process.env.HOSTNAME = '127.0.0.1';
process.env.NODE_ENV = 'production';
process.env.HOME     = writableHome;
process.env.NEXT_TELEMETRY_DISABLED = '1';

const serverEntry = path.join(__dirname, 'server.js');
if (!fs.existsSync(serverEntry)) {
  // First-launch diagnostic: log to stdout so `adb logcat` shows it.
  console.error(
    '[drais] Next standalone server.js missing at ' + serverEntry + '. ' +
    'Did scripts/build-mobile.mjs copy the standalone tree before cap sync?'
  );
  // Keep the runtime alive so the splash page stays visible instead
  // of the app appearing to crash silently.
  setInterval(() => {}, 60_000);
  return;
}

// The standalone server expects to run from its own directory because
// it does `require('./.next/server/...')` with relative paths.
process.chdir(__dirname);

try {
  console.log('[drais] booting Next standalone on 127.0.0.1:' + PORT);
  require(serverEntry);
} catch (err) {
  console.error('[drais] Next server crashed at startup:');
  console.error(err && err.stack ? err.stack : err);
  // Same idea — don't let the runtime exit. The WebView keeps polling
  // and the user can read the crash via adb logcat.
  setInterval(() => {}, 60_000);
}
