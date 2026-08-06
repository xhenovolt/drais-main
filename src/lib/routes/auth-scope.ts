/**
 * Route prefixes that do NOT belong to the school-session auth domain.
 *
 * DRAIS has three separate authentication domains (ADR-0008): school staff
 * (`drais_session`), parents (`drais_parent_session`) and the Xhenvolt Control
 * Center (`drais_control`). Plus machine callers that authenticate per-request
 * with a key rather than a cookie.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This list used to be duplicated in three places that each had to stay in
 * sync by hand:
 *
 *   1. middleware.ts            — server-side route gating
 *   2. src/app/layout.tsx       — whether to render the staff app shell
 *   3. src/contexts/AuthContext — CLIENT-side redirect to the staff login
 *
 * They drifted. (3) was missing `/control`, `/portal` and `/parent`, so any
 * visit to those routes without a school session hit
 * `router.push('/auth/login')` from the client. The Control Center login was
 * therefore only reachable if you happened to already be signed in to a school
 * account — which inverts the isolation the whole design depends on, and made
 * the failure look intermittent rather than total.
 *
 * Anything added here is exempt from SCHOOL auth only. It is not "public":
 * each of these surfaces enforces its own auth (control session, parent
 * session, bearer key, or a signed token).
 *
 * Edge-safe: constants and pure functions only. `middleware.ts` imports this.
 */

/** Surfaces owned by a different auth domain, or authenticated per-request. */
export const NON_SCHOOL_AUTH_PREFIXES: readonly string[] = [
  // ── Xhenvolt Control Center — its own isolated domain (control_users /
  //    control_sessions / drais_control). Never uses or requires a school session.
  '/control',
  '/api/control-center',

  // ── Parent portal — its own session domain (drais_parent_session).
  '/portal',
  '/parent',
  '/api/portal',
  '/api/parent',

  // ── Machine callers: authenticated per-request by key/secret headers or
  //    Bearer credentials, never by a session cookie.
  '/api/platform',   // External Platform API v1 — requirePlatformAuth
  '/api/internal',   // JETON internal APIs — x-api-key
  '/api/control',    // JETON external control channel — x-api-key + x-api-secret
  '/api/cron',       // Cron — CRON_SECRET header

  // ── ZKTeco ADMS push protocol. Attendance devices POST here unattended;
  //    they have no cookie jar, no browser and no way to follow a redirect.
  //    `/iclock/*` is rewritten to `/api/zk-handler` in next.config.js, but
  //    MIDDLEWARE RUNS BEFORE next.config REWRITES — so the middleware sees
  //    the literal `/iclock/cdata` path. Being neither public nor an `/api/`
  //    route, it fell through to `createRedirect(request, '/login')`: a 307
  //    the device cannot follow, so every ATTLOG and OPERLOG upload was
  //    silently discarded. Both spellings are listed because the direct
  //    `/api/zk-handler` path was 401ing for the same reason.
  //
  //    This is NOT a weakening. ADMS has no credential to present — the
  //    protocol authenticates by device serial, and `getDeviceSchoolId(sn)`
  //    resolves tenancy from the registered `SN`. An unregistered serial
  //    resolves to no school and writes nothing but a raw log.
  '/iclock',
  '/api/zk-handler',

  // ── Token-authenticated public surfaces.
  '/verify',         // QR verification — the HMAC-signed token IS the access proof
] as const;

/**
 * Staff-facing routes reachable without a session: the login flow itself,
 * error pages, and the naked print targets.
 */
export const SCHOOL_PUBLIC_ROUTES: readonly string[] = [
  '/',
  '/login',
  '/signup',
  '/auth/login',
  '/auth/signup',
  '/forgot-password',
  '/reset-password',
  '/unauthorized',
  '/forbidden',
  '/server-error',

  // Print targets enforce auth via the API calls they make. A redirect here
  // would break puppeteer mid-capture, so they must not be session-gated at
  // the shell level — a bad cookie surfaces as an inline error instead.
  '/print-snapshot',
  '/print-transcript',
  '/rpt',
] as const;

/** True when `pathname` equals a prefix or sits underneath it. */
export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** True when the route must NOT be gated by, or redirected to, school login. */
export function isExemptFromSchoolAuth(pathname: string): boolean {
  return (
    matchesPrefix(pathname, NON_SCHOOL_AUTH_PREFIXES) ||
    matchesPrefix(pathname, SCHOOL_PUBLIC_ROUTES)
  );
}
