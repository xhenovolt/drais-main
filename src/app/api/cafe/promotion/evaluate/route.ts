/**
 * POST /api/cafe/promotion/evaluate
 *   body: { snapshotId, ruleOverride? }
 *   → { totalCandidates, promotedCount, heldCount, ruleConfigured, perStudent[] }
 *
 * Loads the snapshot + school's promotion rule (or the optional override),
 * runs the existing P2 visibility evaluator per student, returns the
 * per-learner eligibility. Pure read — does NOT mutate enrollment.
 *
 * Permission: cafe.view (anyone with a CAFE role can preview); a separate
 * future endpoint will write to `enrollments` / `promotions` and require
 * `students.update`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { loadSnapshot } from '@/lib/snapshots/storage';
import { evaluatePromotion } from '@/lib/cafe/promotion';
import { getSchoolSettings } from '@/lib/cafe/settings';
import type { VisibilityRule } from '@/lib/drce/visibility';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const body = (await req.json().catch(() => null)) as { snapshotId?: string; ruleOverride?: VisibilityRule | null } | null;
  if (!body?.snapshotId) return NextResponse.json({ error: 'snapshotId required' }, { status: 400 });

  const snapshot = await loadSnapshot(body.snapshotId, session.schoolId);
  if (!snapshot) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });

  // Use override if provided (lets a user dry-run a candidate rule before saving),
  // otherwise the school's persisted promotion_rule_json.
  let rule: VisibilityRule | null = body.ruleOverride ?? null;
  if (rule === undefined || (rule === null && body.ruleOverride === undefined)) {
    const settings = await getSchoolSettings(session.schoolId);
    rule = (settings.promotionRuleJson as unknown as VisibilityRule | null) ?? null;
  }

  const evaluation = evaluatePromotion({ snapshot, rule });
  return NextResponse.json({ success: true, evaluation });
}
