/**
 * Configurable subject ordering for reports (Reporting Architecture Phase 1).
 *
 * Replaces raw database-id ordering (an accident of insertion order) with an
 * explicit, resolvable priority. A school can set:
 *   - a school-wide default order (class_id = null, result_type_id = null)
 *   - a class-specific override  (class_id set)
 *   - an exam-specific override  (result_type_id set)
 *   - a combined class+exam override (both set — most specific, wins first)
 *
 * Resolution picks the MOST SPECIFIC configured rule per subject, falling
 * back through less-specific tiers, and finally to alphabetical-by-name for
 * any subject with no rule at all — deterministic, not random, even
 * unconfigured. This mirrors the "most specific rule wins" pattern already
 * used by report_comment_rules / report_overall_comment_rules rather than
 * inventing a new one.
 */

export interface SubjectOrderRule {
  subjectId: number;
  classId: number | null;
  resultTypeId: number | null;
  priority: number;
}

export interface OrderableSubject {
  id: number;
  name: string;
}

/**
 * Resolve the single best-matching rule per subject for a given
 * (classId, resultTypeId) context. Specificity, most to least:
 *   1. class + result_type exact match
 *   2. class match, rule's result_type is null (applies to any exam)
 *   3. result_type match, rule's class is null (applies to any class)
 *   4. school-wide default (both null)
 */
function specificityScore(rule: SubjectOrderRule, classId: number | null, resultTypeId: number | null): number {
  const classMatches = rule.classId == null || rule.classId === classId;
  const resultMatches = rule.resultTypeId == null || rule.resultTypeId === resultTypeId;
  if (!classMatches || !resultMatches) return -1; // not applicable at all
  let score = 0;
  if (rule.classId != null) score += 2;
  if (rule.resultTypeId != null) score += 1;
  return score; // 3 = class+exam exact, 2 = class-only, 1 = exam-only, 0 = school default
}

/**
 * Build a subjectId -> priority map for one (classId, resultTypeId) context,
 * picking the most specific applicable rule per subject.
 */
export function resolvePriorityMap(
  rules: SubjectOrderRule[],
  classId: number | null,
  resultTypeId: number | null,
): Map<number, number> {
  const best = new Map<number, { score: number; priority: number }>();
  for (const rule of rules) {
    const score = specificityScore(rule, classId, resultTypeId);
    if (score < 0) continue;
    const current = best.get(rule.subjectId);
    if (!current || score > current.score) {
      best.set(rule.subjectId, { score, priority: rule.priority });
    }
  }
  const out = new Map<number, number>();
  for (const [subjectId, v] of best) out.set(subjectId, v.priority);
  return out;
}

/**
 * PURE: order a list of subjects for one (classId, resultTypeId) context.
 * Configured subjects sort by resolved priority (lower first); unconfigured
 * subjects sort alphabetically by name AFTER all configured ones — visible,
 * predictable behaviour rather than silent id-order for anything not yet set up.
 */
export function orderSubjects<T extends OrderableSubject>(
  subjects: T[],
  rules: SubjectOrderRule[],
  classId: number | null,
  resultTypeId: number | null,
): T[] {
  const priorityMap = resolvePriorityMap(rules, classId, resultTypeId);
  return [...subjects].sort((a, b) => {
    const pa = priorityMap.get(a.id);
    const pb = priorityMap.get(b.id);
    if (pa != null && pb != null) return pa - pb || a.name.localeCompare(b.name);
    if (pa != null) return -1; // configured subjects come first
    if (pb != null) return 1;
    return a.name.localeCompare(b.name); // both unconfigured — alphabetical, deterministic
  });
}
