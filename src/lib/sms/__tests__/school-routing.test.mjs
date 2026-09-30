// School SMS routing: "school A uses the provider school B uses", per-school / selected / all, loop-safe.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRoutePlan, validateProposedRoute } from '@/lib/sms/school-routing.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const ALBAYAN = 8002, NAKIFUMA = 12020, OTHER = 12003;
const has = (ids) => (id) => ids.includes(id);
const map = (o) => new Map(Object.entries(o).map(([k, v]) => [Number(k), { mode: 'inherit', centralProviderId: null, sourceSchoolId: null, ...v }]));

describe('resolving a route', () => {
  it('no explicit route + an active platform provider = Control Center is authoritative', () => {
    // Regression for the real Nakifuma incident: the founder switched the
    // platform's active provider (Africa's Talking -> Yoola) in Control
    // Center, but Nakifuma had no EXPLICIT school_sms_routes row (the
    // default state) and kept sending via its own leftover comm_settings
    // Africa's Talking credentials for days. Control Center's choice must
    // win for any school that hasn't been explicitly told to use its own
    // account.
    const centralNoRow = resolveRoutePlan(NAKIFUMA, new Map(), has([NAKIFUMA]), 2);
    assert.deepEqual(centralNoRow, { kind: 'central', providerId: 2, via: [NAKIFUMA] });
    const centralInherit = resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'inherit' } }), has([NAKIFUMA]), 2);
    assert.deepEqual(centralInherit, { kind: 'central', providerId: 2, via: [NAKIFUMA] });
  });
  it('no explicit route and NO active platform provider at all = true bootstrap fallback to legacy', () => {
    assert.deepEqual(resolveRoutePlan(NAKIFUMA, new Map(), has([NAKIFUMA]), null).kind, 'legacy');
    assert.deepEqual(resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'inherit' } }), has([]), null).kind, 'legacy');
  });
  it('an EXPLICIT mode: "own" is still honoured even with an active platform provider — Control Center chose that exception on purpose', () => {
    assert.deepEqual(resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'own' } }), has([NAKIFUMA]), 2), { kind: 'own', schoolId: NAKIFUMA, via: [NAKIFUMA] });
  });
  it('same_as: Nakifuma follows Albayan\'s OWN EXPLICIT route — resolved live, nothing copied', () => {
    // Albayan must have an explicit mode:'own' route of its own for this to
    // resolve to 'own' — same_as means "resolve as if you asked Albayan",
    // and asking Albayan directly (with no explicit route of its own) now
    // resolves to the active central provider too, consistently.
    const p = resolveRoutePlan(
      NAKIFUMA,
      map({ [NAKIFUMA]: { mode: 'same_as', sourceSchoolId: ALBAYAN }, [ALBAYAN]: { mode: 'own' } }),
      has([ALBAYAN, NAKIFUMA]), 2,
    );
    assert.deepEqual(p, { kind: 'own', schoolId: ALBAYAN, via: [NAKIFUMA, ALBAYAN] });
  });
  it('same_as to a school with NO explicit route of its own also follows the active central provider — consistent with resolving that school directly', () => {
    const p = resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'same_as', sourceSchoolId: ALBAYAN } }), has([ALBAYAN, NAKIFUMA]), 2);
    assert.deepEqual(p, { kind: 'central', providerId: 2, via: [NAKIFUMA, ALBAYAN] });
  });
  it('same_as follows the source school\'s own explicit route (chains)', () => {
    const routes = map({ [NAKIFUMA]: { mode: 'same_as', sourceSchoolId: OTHER }, [OTHER]: { mode: 'central', centralProviderId: 3 } });
    assert.deepEqual(resolveRoutePlan(NAKIFUMA, routes, has([]), null), { kind: 'central', providerId: 3, via: [NAKIFUMA, OTHER] });
  });
  it('a source with no explicit route and no account falls back to the platform provider if there is one, else errors', () => {
    const routes = map({ [NAKIFUMA]: { mode: 'same_as', sourceSchoolId: OTHER } });
    assert.equal(resolveRoutePlan(NAKIFUMA, routes, has([]), 2).kind, 'central');
    assert.equal(resolveRoutePlan(NAKIFUMA, routes, has([]), null).kind, 'error');
  });
  it('central: a chosen provider', () => {
    assert.equal(resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'central', centralProviderId: 1 } }), has([]), null).providerId, 1);
    assert.equal(resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'central' } }), has([]), null).kind, 'error');
  });
  it('own: needs the school\'s own credentials — and fails loudly without them', () => {
    assert.equal(resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'own' } }), has([NAKIFUMA]), null).kind, 'own');
    const e = resolveRoutePlan(NAKIFUMA, map({ [NAKIFUMA]: { mode: 'own' } }), has([]), null);
    assert.equal(e.kind, 'error'); assert.match(e.reason, /no SMS account/);
  });
  it('two schools pointing at each other is a loop, not an infinite one', () => {
    const routes = map({ 1: { mode: 'same_as', sourceSchoolId: 2 }, 2: { mode: 'same_as', sourceSchoolId: 1 } });
    const p = resolveRoutePlan(1, routes, has([]), null);
    assert.equal(p.kind, 'error'); assert.match(p.reason, /loop/);
  });
});

describe('validating a change before saving', () => {
  it('rejects copying itself and selections that include the source', () => {
    assert.match(validateProposedRoute([ALBAYAN, NAKIFUMA], { mode: 'same_as', centralProviderId: null, sourceSchoolId: ALBAYAN }, new Map(), has([ALBAYAN]), null), /cannot copy itself/);
  });
  it('accepts several schools all following one school', () => {
    assert.equal(validateProposedRoute([NAKIFUMA, OTHER], { mode: 'same_as', centralProviderId: null, sourceSchoolId: ALBAYAN }, new Map(), has([ALBAYAN]), null), null);
  });
  it('rejects a change that would create a loop with an existing route', () => {
    const existing = map({ [ALBAYAN]: { mode: 'same_as', sourceSchoolId: NAKIFUMA } });
    assert.match(validateProposedRoute([NAKIFUMA], { mode: 'same_as', centralProviderId: null, sourceSchoolId: ALBAYAN }, existing, has([]), null), /loop/);
  });
  it('rejects copying a school that has no account when there is no platform provider', () => {
    assert.match(validateProposedRoute([NAKIFUMA], { mode: 'same_as', centralProviderId: null, sourceSchoolId: OTHER }, new Map(), has([]), null), /no SMS account/);
  });
});

describe('every send path honours the route, and secrets never leave the server', () => {
  it('attendance outbox drain, bulk broadcast, and the shared sendSMS entry point all consult the route first', () => {
    assert.match(read('lib/notifications/drain.ts'), /sendViaSchoolRoute\(row\.school_id/);
    assert.match(read('app/api/admin/comm/broadcast/route.ts'), /sendViaSchoolRoute\(session\.schoolId/);
    assert.match(read('lib/sms/central.ts'), /sendViaSchoolRoute\(legacyCreds\.schoolId/);
    assert.match(read('app/api/sms/send/route.ts'), /schoolId: session\.schoolId/);
    assert.match(read('lib/comm/dispatcher.ts'), /\{ schoolId: payload\.schoolId \}/);
  });
  it('a broken route fails loudly instead of silently using another account', () => {
    const src = read('lib/sms/school-routing.ts');
    assert.match(src, /SMS route problem/);
    assert.match(src, /if \(plan\.kind === 'legacy'\) return null;/);
  });
  it('the API never returns credentials and is permission-gated and audited', () => {
    const api = read('app/api/control-center/sms/routing/route.ts');
    assert.doesNotMatch(api, /provider_api_key|encrypted_config|apiKey/);
    assert.match(api, /controlCan\(user\.role, 'sms\.route\.manage'\)/);
    assert.match(api, /controlAudit\(user\.id, 'set_sms_route'/);
    const ver = read('app/api/control-center/sms/routing/verify/route.ts');
    assert.match(ver, /never returns a secret|Never returns a secret/i);
    assert.doesNotMatch(ver, /NextResponse\.json\([^)]*(\.k|apiKey)/);
  });
  it('only operators with the manage permission can change routing; viewers can look', async () => {
    const { controlCan } = await import('@/lib/control/permissions.ts');
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'sms.route.manage'), true);
    assert.equal(controlCan('XHENVOLT_VIEWER', 'sms.route.view'), true);
    assert.equal(controlCan('XHENVOLT_VIEWER', 'sms.route.manage'), false);
    assert.equal(controlCan('school_admin', 'sms.route.view'), false);
  });
});
