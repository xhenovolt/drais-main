/**
 * withRoute — the standard robustness wrapper for DRAIS API routes
 * (Founder-Independence Phase G).
 *
 * Every route that adopts this gets, uniformly and for free:
 *   • authentication — session resolved once, 401 if absent (unless auth:false)
 *   • authorization  — an optional permission enforced, 403 if missing
 *   • robustness     — the handler runs inside try/catch; an unhandled throw
 *                      becomes a clean JSON 500 instead of a crashed lambda
 *   • a consistent error envelope: always `{ error: string }` with the right
 *     status (the shape every DRAIS client already reads), and honouring an
 *     `err.statusCode` when a caller throws a typed error (e.g. 403 from
 *     requirePermission, 400 from a validation throw).
 *
 * It removes the per-route boilerplate of "getSession → 401 → requirePermission
 * → try/catch" that the route-hardening audit flagged (R-8: 112 routes had no
 * try/catch). Handlers become just the logic:
 *
 *   export const POST = withRoute({ permission: 'attendance.manage' },
 *     async ({ session, body }) => {
 *       const b = await body();
 *       return { success: true, ... };   // plain object → 200 JSON
 *     });
 *
 * A handler may return a plain object (wrapped as 200 JSON) or its own
 * NextResponse (passed through untouched — for custom status/headers/streams).
 *
 * resolveError() is PURE and unit-tested.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId, type SessionInfo } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { resolveError, type ResolvedError } from '@/lib/api/resolve-error';

export { resolveError, type ResolvedError };

export interface RouteContext<P = Record<string, string>> {
  req: NextRequest;
  /** The authenticated session. Never null inside a handler when auth is on. */
  session: SessionInfo;
  /** Resolved dynamic route params ({} for static routes). */
  params: P;
  /** Memoised JSON body parse — returns null on empty/invalid body, never throws. */
  body: <T = any>() => Promise<T | null>;
}

export interface WithRouteOptions {
  /** Require an authenticated session (default true). Set false for public routes. */
  auth?: boolean;
  /** Enforce this permission code after authentication (implies auth). */
  permission?: string;
}

/** PURE: coerce a handler's return into a NextResponse (plain object → 200 JSON). */
function toResponse(result: unknown): NextResponse {
  if (result instanceof NextResponse) return result;
  return NextResponse.json(result ?? { success: true });
}

type Handler<P> = (ctx: RouteContext<P>) => Promise<unknown> | unknown;

/** Next passes (req, { params }) for dynamic routes; params may be a promise (Next 15). */
async function resolveParams(routeArg: any): Promise<Record<string, string>> {
  const p = routeArg?.params;
  if (!p) return {};
  return typeof p.then === 'function' ? await p : p;
}

export function withRoute<P = Record<string, string>>(
  optionsOrHandler: WithRouteOptions | Handler<P>,
  maybeHandler?: Handler<P>,
) {
  const options: WithRouteOptions = typeof optionsOrHandler === 'function' ? {} : optionsOrHandler;
  const handler = (typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler) as Handler<P>;
  const needsAuth = options.auth !== false || !!options.permission;

  return async (req: NextRequest, routeArg?: any): Promise<NextResponse> => {
    try {
      let session = (await getSessionSchoolId(req)) as SessionInfo | null;
      if (needsAuth && !session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (options.permission && session) {
        // requirePermission throws a 403-tagged error → caught below → 403 JSON.
        await requirePermission(session.userId, session.schoolId, options.permission, session.isSuperAdmin);
      }

      // Platform read-only maintenance (Phase 23): block tenant WRITES while a
      // risky deploy/migration is in progress; reads still pass. Control Center
      // routes don't use withRoute, so operators can always lift it. Cached 30s.
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        const { getMaintenance, isReadOnly } = await import('@/lib/control/platform-settings');
        const m = await getMaintenance();
        if (isReadOnly(m.mode)) {
          return NextResponse.json(
            { error: m.message || 'DRAIS is in read-only maintenance. Please try again shortly.' },
            { status: 503, headers: { 'Retry-After': '120' } },
          );
        }
      }

      let bodyCache: any; let bodyParsed = false;
      const ctx: RouteContext<P> = {
        req,
        session: session as SessionInfo,
        params: (await resolveParams(routeArg)) as P,
        body: async <T = any>() => {
          if (!bodyParsed) { bodyParsed = true; bodyCache = await req.json().catch(() => null); }
          return bodyCache as T | null;
        },
      };

      return toResponse(await handler(ctx));
    } catch (err) {
      const { status, body } = resolveError(err);
      if (status >= 500) console.error(`[withRoute] ${req.nextUrl?.pathname} →`, err);
      return NextResponse.json(body, { status });
    }
  };
}
