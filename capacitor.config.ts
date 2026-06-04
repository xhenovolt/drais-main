import type { CapacitorConfig } from '@capacitor/cli';

/**
 * DRAIS — Capacitor config for the Android APK build.
 *
 * Topology (same model as the Windows Electron build):
 *   - nodejs-mobile boots a real Node.js runtime inside the APK.
 *   - Inside that runtime, mobile/nodejs-project/main.js requires the
 *     Next standalone server (server.js) which listens on 127.0.0.1:3210.
 *   - The WebView loads http://127.0.0.1:3210/ via `server.url` below,
 *     so the user sees the full Next.js App Router experience —
 *     dynamic routes, API routes, server components, SSE, all of it —
 *     exactly as if they had run `npm start` and opened the browser
 *     to localhost. No static export, no API rewrite, no feature loss.
 *
 * webDir is required by Capacitor but only used as a fallback
 * placeholder; when server.url is set the WebView never loads it.
 * We point it at a tiny splash page in mobile/webview-placeholder/
 * which says "DRAIS is starting…" so a cold-launch race never shows
 * a blank screen.
 */

const config: CapacitorConfig = {
  appId: 'ug.drais.mobile',
  appName: 'DRAIS',
  webDir: 'mobile/webview-placeholder',
  bundledWebRuntime: false,

  android: {
    // Required: allow HTTP traffic to 127.0.0.1 (the embedded Next
    // server runs HTTP, not HTTPS — same as `next start` on the
    // browser localhost). The native project's
    // res/xml/network_security_config.xml whitelists 127.0.0.1; see
    // the wire-up step in scripts/build-mobile.mjs.
    allowMixedContent: true,
    // 'always' lets the WebView reach localhost on Android 9+.
    // (Default 'auto' blocks plaintext to localhost on some OEMs.)
    webContentsDebuggingEnabled: true,
  },

  server: {
    // The embedded Next server listens on 127.0.0.1:3210 (see
    // mobile/nodejs-project/main.js). Capacitor's WebView loads this
    // URL instead of the file:// webDir, so SSR, API routes, SSE,
    // and the /iclock/* rewrite all keep working.
    //
    // 127.0.0.1 is preferred over localhost on Android because some
    // OEMs resolve localhost via IPv6-only and the embedded server
    // binds IPv4.
    url: 'http://127.0.0.1:3210',
    cleartext: true,
    // androidScheme defaults to 'https' in Capacitor 5+. We override
    // to 'http' so the WebView matches the embedded server's scheme.
    androidScheme: 'http',
  },
};

export default config;
