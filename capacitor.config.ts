import type { CapacitorConfig } from '@capacitor/cli';

/**
 * DRAIS — Capacitor config for the Android APK build.
 *
 * Topology (same model as the Windows Electron build):
 *   - nodejs-mobile boots a real Node.js runtime inside the APK.
 *   - Inside that runtime, mobile/nodejs-project/main.js requires the
 *     Next standalone server (server.js) which listens on 127.0.0.1:3210.
 *   - webDir points at a tiny placeholder page (mobile/webview-placeholder/)
 *     that the WebView loads FIRST. Its script calls nodejs.start('main.js')
 *     over the Cordova bridge, polls 127.0.0.1:3210 until the embedded Next
 *     server answers, then navigates the WebView there — so the user ends
 *     up seeing the full Next.js App Router experience (dynamic routes,
 *     API routes, server components, SSE, all of it), just one boot step
 *     later than a plain `server.url` would give. No static export, no
 *     API rewrite, no feature loss.
 *   - There is deliberately NO `server.url` below — see the comment in
 *     the `server` block for why (it was tried and removed: the Cordova
 *     bridge that starts Node is only injected into pages served from
 *     webDir, not into a page loaded via server.url, so setting it made
 *     every launch race Node and lose with ERR_CONNECTION_REFUSED).
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
    // IMPORTANT: no `server.url` here. The nodejs-mobile-cordova engine is
    // only started by a JS call (`nodejs.start('main.js')`) over the Cordova
    // bridge — and that bridge is only injected into pages served from the
    // Capacitor local server (webDir). With `server.url` set the WebView
    // went straight to http://127.0.0.1:3210 before anything had started
    // Node, and every launch died with ERR_CONNECTION_REFUSED.
    //
    // Boot sequence now: WebView loads mobile/webview-placeholder/, its
    // script calls nodejs.start('main.js'), polls 127.0.0.1:3210, and
    // navigates there once the embedded Next server answers.
    cleartext: true,
    // 'http' so the placeholder's origin scheme matches the embedded
    // server's plain-HTTP scheme (no mixed-content block on the poll).
    androidScheme: 'http',
    // Allow in-WebView navigation to the embedded server; without this
    // Capacitor would bounce the redirect out to the system browser.
    allowNavigation: ['127.0.0.1'],
  },
};

export default config;
