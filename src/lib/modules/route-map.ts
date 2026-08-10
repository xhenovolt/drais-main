/**
 * Which API surface belongs to which module — the single source of truth for
 * server-side entitlement enforcement (Phase 3).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `src/lib/auth/requireModule.ts` has said since Phase A: "Phase F wires this
 * into every gated API route... Until then the helpers exist". That wiring was
 * never done. Measured before this change:
 *
 *     61 of 692 API routes carried any module gate
 *     finance           0 gated   (56 routes)
 *     academics         0 gated
 *     fingerprint_auth  0 gated
 *
 * The consequence was live, not theoretical. School 12003 (CITY PARENTS HIGH
 * SCHOOL) has had `academics` disabled since 2026-06-17, and every academics
 * API kept serving it. An entitlement an operator can set but the server does
 * not honour is worse than none: it reports a restriction that is not real.
 *
 * KEEPING THE MAP HONEST
 * ----------------------
 * A prefix list drifts from reality the moment someone adds a route. It is
 * declarative here (rather than a `checkModule` call copied into each handler
 * by hand) so that coverage can be ASSERTED — `moduleForPath` is pure, so a
 * test can walk `src/app/api` and prove every route under a mapped prefix
 * actually enforces its module.
 *
 * ORDER MATTERS: the first matching prefix wins, so the more specific entry
 * must come first. `/api/finance/reports` resolves to `finance`, not to
 * `analytics`, because a school without Finance should not read finance
 * figures through a reporting URL.
 *
 * NOT LISTED = NOT GATED, deliberately. Auth, health, device ingestion, the
 * Control Center and the parent portal are outside the school module model.
 * Adding a prefix here is a policy decision, not a formality: it can take a
 * working screen away from a school.
 */
import type { ModuleCode } from '@/lib/school-modules-codes';

export interface ModuleRoute {
  /** Matched against the pathname as an exact segment prefix. */
  prefix: string;
  module: ModuleCode;
}

export const MODULE_ROUTES: readonly ModuleRoute[] = [
  // ── Finance. The largest ungated surface before Phase 3.
  { prefix: '/api/finance',        module: 'finance' },
  // NOTE: /api/payroll does not exist. The payroll SCREENS talk to a PHP
  // backend directly (NEXT_PUBLIC_PHP_API_BASE, default http://localhost/
  // drais/api) rather than to a Next route, so there is nothing here to gate
  // and the payroll entitlement cannot currently be enforced at all. Kept as a
  // declaration of intent: the day payroll gets real API routes they inherit
  // the gate instead of shipping ungated. See the Phase 1 report.
  { prefix: '/api/payroll',        module: 'payroll' },

  // ── Academics. The module with a real, live disable that was not honoured.
  { prefix: '/api/academics',      module: 'academics' },
  { prefix: '/api/results',        module: 'academics' },
  { prefix: '/api/class_results',  module: 'academics' },
  { prefix: '/api/class-results',  module: 'academics' },
  { prefix: '/api/report-cards',   module: 'academics' },
  { prefix: '/api/report-templates', module: 'academics' },
  { prefix: '/api/report-comments',  module: 'academics' },
  { prefix: '/api/drce',           module: 'academics' },
  { prefix: '/api/snapshots',      module: 'academics' },
  { prefix: '/api/promotions',     module: 'academics' },
  { prefix: '/api/result_types',   module: 'academics' },

  // ── Operations.
  { prefix: '/api/tahfiz',         module: 'tahfiz' },
  { prefix: '/api/inventory',      module: 'inventory' },
  { prefix: '/api/issuance',       module: 'inventory' },
  { prefix: '/api/workplans',      module: 'work_plans' },
  { prefix: '/api/work-plans',     module: 'work_plans' },
] as const;

/**
 * Routes that sit under a mapped prefix but must NOT be gated. Listed
 * explicitly, with the reason, so coverage can be asserted at 100% of the
 * gateable surface instead of resting on someone's judgement each time.
 *
 * A route ends up here for exactly one of three reasons: it is already
 * retired, it is a stub, or gating it would break something that should
 * outlive the entitlement.
 */
export const UNGATED_BY_DESIGN: Readonly<Record<string, string>> = {
  // Retired write paths — already 410 Gone. A module gate on a corpse adds
  // nothing and would change a clear 410 into a confusing 403.
  '/api/finance/fee_payments': 'retired — returns 410',
  '/api/finance/pay_fee_item': 'retired — returns 410',
  '/api/finance/waivers':      'retired — returns 410',
  '/api/tahfiz/learners':      'retired — returns 410',

  // Stubs — never implemented, return 501.
  '/api/results/edit':      'stub — returns 501',
  '/api/results/audit/[id]': 'stub — returns 501',

  // No school session exists to gate against, and none should.
  '/api/drce/builtin/[id]':
    'static built-in template registry; carries no school data',

  // The QR on a PRINTED receipt points here. A parent holding a receipt from
  // last term must still be able to verify it after the school stops paying
  // for Finance — the document was genuine when issued and stays genuine.
  // It is token-gated, and returns only a genuineness confirmation.
  '/api/finance/receipts/[ref]/verify':
    'public token-gated receipt verification; must outlive the entitlement',
};

/**
 * The module governing a pathname, or null when the path is outside the
 * module model. Pure — no database, no request object — so it can be unit
 * tested and used to audit coverage.
 *
 * Matches on segment boundaries so `/api/financex` never matches
 * `/api/finance`.
 */
export function moduleForPath(pathname: string): ModuleCode | null {
  const path = (pathname || '').split('?')[0].replace(/\/+$/, '');
  for (const entry of MODULE_ROUTES) {
    if (path === entry.prefix || path.startsWith(entry.prefix + '/')) {
      return entry.module;
    }
  }
  return null;
}
