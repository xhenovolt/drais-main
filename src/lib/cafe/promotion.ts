/**
 * CAFE Phase 5 — promotion evaluator.
 *
 * Reuses the existing P2 VisibilityRule type as the rule language —
 * NO new rule grammar. The school's promotion rule lives in
 * `school_academic_settings.promotion_rule_json` (column was provisioned
 * in Phase 1's migration; nothing new to add).
 *
 * Run against a snapshot to produce per-student promotion eligibility.
 * Pure function — no I/O, no Date.now.
 */
import { evaluateRule, type VisibilityRule } from '@/lib/drce/visibility';
import { snapshotToDRCEDataContext } from '@/lib/snapshots/adapter/toDRCEDataContext';
import type { ReportSnapshot } from '@/lib/snapshots/types';

export interface PromotionResult {
  studentDbId:    number;
  studentName:    string;
  className:      string;
  total:          number;
  average:        number;
  position:       number;
  eligibility:    'promote' | 'hold' | 'no_rule';
}

export interface PromotionEvaluation {
  totalCandidates:     number;
  promotedCount:       number;
  heldCount:           number;
  ruleConfigured:      boolean;
  ruleSummary:         string | null;
  perStudent:          PromotionResult[];
}

/**
 * Evaluate every student in a snapshot against the school's promotion rule.
 * Without a rule, every student is returned with `eligibility: 'no_rule'`
 * so callers can fall back to manual promotion.
 */
export function evaluatePromotion(args: {
  snapshot: ReportSnapshot;
  rule:     VisibilityRule | null;
}): PromotionEvaluation {
  const { snapshot, rule } = args;
  const perStudent: PromotionResult[] = [];
  let promoted = 0, held = 0;

  for (let ci = 0; ci < snapshot.classes.length; ci++) {
    const cls = snapshot.classes[ci];
    for (let si = 0; si < cls.students.length; si++) {
      const stu = cls.students[si];
      const ctx = snapshotToDRCEDataContext(
        snapshot, ci, si,
        snapshot.meta.branding
          ? { schoolName: snapshot.meta.branding.schoolName }
          : { schoolName: snapshot.meta.schoolName },
      );
      let elig: PromotionResult['eligibility'] = 'no_rule';
      if (rule) {
        elig = evaluateRule(rule, ctx) ? 'promote' : 'hold';
        if (elig === 'promote') promoted++; else held++;
      }
      perStudent.push({
        studentDbId: stu.studentDbId,
        studentName: stu.name,
        className:   cls.className,
        total:       stu.total,
        average:     stu.average,
        position:    stu.position,
        eligibility: elig,
      });
    }
  }

  return {
    totalCandidates: perStudent.length,
    promotedCount:   promoted,
    heldCount:       held,
    ruleConfigured:  rule != null,
    ruleSummary:     rule ? describeRuleShort(rule) : null,
    perStudent,
  };
}

/** Short single-line description for UI banners. */
function describeRuleShort(rule: VisibilityRule): string {
  if (rule.kind === 'compare') return `${rule.left} ${rule.op}${rule.right ? ' …' : ''}`;
  const op = rule.op === 'AND' ? 'all of' : 'any of';
  return `${op} ${rule.children.length} condition${rule.children.length === 1 ? '' : 's'}${rule.negate ? ' (negated)' : ''}`;
}
