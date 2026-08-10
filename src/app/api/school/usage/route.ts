/**
 * GET /api/school/usage — the signed-in school's own capacity position.
 *
 * WHY A SCHOOL SEES THIS AT ALL
 * -----------------------------
 * Phase 4 made plan limits real: a school at its ceiling is refused when it
 * tries to admit a learner. Refusing someone at the moment they are enrolling a
 * child, with no prior warning, is the worst possible time to discover a
 * commercial limit — the registrar has a parent in front of them and no idea
 * why the system said no. This endpoint exists so the app can say "you are at
 * 941 of 1,000" a week earlier, while there is still time to archive leavers or
 * talk to Xhenvolt.
 *
 * Scoped from the SESSION, never from a parameter — a school can only ever read
 * its own position. No plan pricing, no other tenant's figures, nothing an
 * ordinary member of staff should not see: just counts, ceilings and severity.
 *
 * Deliberately NOT permission-gated. Every member of staff who can be refused a
 * creation should be able to understand why, and hiding the reason behind an
 * admin permission is how "the system is broken" tickets get raised.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getUsageSummary, severityFor, limitLabel, limitLabelFor, LIMIT_WARN_PERCENT } from '@/lib/entitlements/limits';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const states = await getUsageSummary(session.schoolId).catch(() => []);

  const limits = states
    // Only things with a real, measurable ceiling can be reported honestly.
    .filter((s) => s.limit !== null && s.used !== null)
    .map((s) => ({
      key:       String(s.key),
      label:     limitLabel(s.key),
      /** Agrees with `remaining`, so the banner never says "1 learners". */
      labelRemaining: limitLabelFor(s.key, s.remaining as number),
      used:      s.used as number,
      limit:     s.limit as number,
      remaining: s.remaining as number,
      percent:   s.percent as number,
      severity:  severityFor(s),
    }));

  // Worst first, so a caller that shows one line shows the one that matters.
  const alerts = limits
    .filter((l) => l.severity !== 'ok')
    .sort((a, b) => b.percent - a.percent);

  return NextResponse.json({
    success: true,
    warnAtPercent: LIMIT_WARN_PERCENT,
    limits,
    alerts,
    worst: alerts[0] ?? null,
  });
}
