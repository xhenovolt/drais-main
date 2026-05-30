/**
 * Conflict resolver — pure, policy-driven decisions about what to do
 * when an incoming row's identity already exists in DRAIS.
 *
 * Phase 0 found three incompatible conflict policies in the codebase:
 *   - students-import:  SKIP / UPDATE / CREATE  (no per-field control)
 *   - bulk-submit:      silent OVERWRITE         (no audit)
 *   - marks-migration:  user picks SKIP / OVERWRITE / MERGE_AVG  (per-run)
 *
 * This module collapses those into one mechanism. The resolver takes
 * the incoming row's mapped values + the existing row's current values
 * + a school-configured ConflictPolicySet, and returns:
 *   - The list of fields that should actually be written
 *   - The merged values for each
 *   - An explanation per field for the audit log
 *
 * The resolver itself does no DB I/O. The caller fetches the existing
 * row, passes both shapes here, then applies the returned `changes`
 * map to the UPDATE statement.
 *
 * Three policies (FAIL_LOUD especially) intentionally produce decisions
 * the caller must surface to a human. Silent corruption is the bug we
 * are eradicating.
 */

import type {
  ConflictDecision,
  ConflictPolicySet,
  FieldConflictPolicy,
  RawCellValue,
} from '../types';

/**
 * Per-field comparison output. The caller iterates this to build the
 * UPDATE statement; the audit logger reads `reason` to log per-field
 * decisions.
 */
export interface FieldDecision {
  field: string;
  existing: RawCellValue;
  incoming: RawCellValue;
  policy: FieldConflictPolicy;
  /** What the resolver decided the row should land at. */
  resolved: RawCellValue;
  /** True iff the resolved value differs from `existing` (i.e. the UPDATE
   *  will actually change this column). */
  changed: boolean;
  /** Human-readable trace for the audit log. */
  reason: string;
  /** True iff the policy requires the caller to ABORT and surface this
   *  conflict to a human reviewer. fail-loud sets this. */
  blocks: boolean;
}

export interface ResolveConflictResult {
  decisions: FieldDecision[];
  /** True iff any field decision has blocks=true. The pipeline turns this
   *  into a ConflictDecision { action: 'fail', error: '...' }. */
  blocksAnyField: boolean;
  /** True iff any field actually changed. False = noop UPDATE; caller
   *  can short-circuit. */
  anyChange: boolean;
}

/**
 * The core entry point. Given an existing row, an incoming row, and a
 * policy, produce a decision per field.
 */
export function resolveFieldConflicts(args: {
  existing: Record<string, RawCellValue>;
  incoming: Record<string, RawCellValue>;
  policy: ConflictPolicySet;
  /** When provided, only these fields are considered. Useful when the
   *  importer wants to ignore certain columns regardless of the policy. */
  considerFields?: string[];
}): ResolveConflictResult {
  const fields = args.considerFields ?? Array.from(new Set([
    ...Object.keys(args.existing),
    ...Object.keys(args.incoming),
  ]));

  const decisions: FieldDecision[] = [];
  let anyChange = false;
  let blocksAnyField = false;

  for (const field of fields) {
    const existing = args.existing[field];
    const incoming = args.incoming[field];
    const policy = args.policy.perField[field] ?? args.policy.default;

    // No incoming value supplied → never write. Treat as 'prefer-existing'.
    if (incoming === undefined) {
      decisions.push({
        field, existing, incoming,
        policy,
        resolved: existing,
        changed: false,
        reason: 'no incoming value — kept existing',
        blocks: false,
      });
      continue;
    }

    // No existing value → unconditional insert regardless of policy.
    // (`prefer-existing` is meaningless when there's nothing to prefer.)
    if (existing === undefined || existing === null || existing === '') {
      const changed = incoming !== null && incoming !== undefined && incoming !== '';
      decisions.push({
        field, existing, incoming,
        policy,
        resolved: incoming,
        changed,
        reason: 'no existing value — filled from incoming',
        blocks: false,
      });
      if (changed) anyChange = true;
      continue;
    }

    // Both supplied — apply policy.
    const decision = applyPolicy(field, existing, incoming, policy);
    decisions.push(decision);
    if (decision.changed) anyChange = true;
    if (decision.blocks) blocksAnyField = true;
  }

  return { decisions, blocksAnyField, anyChange };
}

function applyPolicy(
  field: string,
  existing: RawCellValue,
  incoming: RawCellValue,
  policy: FieldConflictPolicy,
): FieldDecision {
  // Treat exact equality as a no-op, regardless of policy.
  if (valuesEqual(existing, incoming)) {
    return {
      field, existing, incoming, policy,
      resolved: existing, changed: false,
      reason: 'identical values — no change',
      blocks: false,
    };
  }

  switch (policy) {
    case 'prefer-new':
      return {
        field, existing, incoming, policy,
        resolved: incoming, changed: true,
        reason: `prefer-new: overwriting "${stringify(existing)}" → "${stringify(incoming)}"`,
        blocks: false,
      };
    case 'prefer-existing':
      return {
        field, existing, incoming, policy,
        resolved: existing, changed: false,
        reason: `prefer-existing: kept "${stringify(existing)}", dropped incoming "${stringify(incoming)}"`,
        blocks: false,
      };
    case 'prefer-non-empty': {
      const existingEmpty = isEmpty(existing);
      const winner = existingEmpty ? incoming : existing;
      const changed = existingEmpty;
      return {
        field, existing, incoming, policy,
        resolved: winner, changed,
        reason: existingEmpty
          ? `prefer-non-empty: existing was empty, took incoming`
          : `prefer-non-empty: existing populated, kept it`,
        blocks: false,
      };
    }
    case 'prefer-higher':
    case 'prefer-lower': {
      const a = toNumber(existing);
      const b = toNumber(incoming);
      if (a == null || b == null) {
        return {
          field, existing, incoming, policy,
          resolved: existing, changed: false,
          reason: `${policy}: non-numeric values, kept existing`,
          blocks: false,
        };
      }
      const winner = policy === 'prefer-higher' ? Math.max(a, b) : Math.min(a, b);
      const changed = winner !== a;
      return {
        field, existing, incoming, policy,
        resolved: winner, changed,
        reason: `${policy}: ${a} vs ${b} → ${winner}`,
        blocks: false,
      };
    }
    case 'merge-average': {
      const a = toNumber(existing);
      const b = toNumber(incoming);
      if (a == null || b == null) {
        return {
          field, existing, incoming, policy,
          resolved: existing, changed: false,
          reason: 'merge-average: non-numeric values, kept existing',
          blocks: false,
        };
      }
      const avg = Math.round(((a + b) / 2) * 100) / 100;
      return {
        field, existing, incoming, policy,
        resolved: avg, changed: avg !== a,
        reason: `merge-average: (${a} + ${b}) / 2 = ${avg}`,
        blocks: false,
      };
    }
    case 'fail-loud':
      return {
        field, existing, incoming, policy,
        resolved: existing, changed: false,
        reason: `fail-loud: existing "${stringify(existing)}" ≠ incoming "${stringify(incoming)}" — review required`,
        blocks: true,
      };
  }
}

/**
 * Compose a ConflictDecision from a ResolveConflictResult. Useful for
 * the pipeline runner so the per-row outcome includes the high-level
 * decision and the per-field detail goes into the audit log.
 */
export function toConflictDecision(
  result: ResolveConflictResult,
  targetId: number,
  mergeRuleDescription?: string,
): ConflictDecision {
  if (result.blocksAnyField) {
    const blockers = result.decisions
      .filter(d => d.blocks)
      .map(d => `${d.field}: ${d.reason}`);
    return { action: 'fail', error: `fail-loud blocked: ${blockers.join(' | ')}` };
  }
  if (!result.anyChange) {
    return { action: 'skip', reason: 'no field changes after conflict resolution' };
  }
  const changedFields = result.decisions
    .filter(d => d.changed)
    .map(d => d.field);
  if (mergeRuleDescription) {
    return {
      action: 'merge',
      targetId,
      changedFields,
      mergeRule: mergeRuleDescription,
    };
  }
  return { action: 'update', targetId, changedFields };
}

// ─── primitives ──────────────────────────────────────────────────────────────

function valuesEqual(a: RawCellValue, b: RawCellValue): boolean {
  if (a === b) return true;
  // Numeric equivalence — '85' === 85
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na != null && nb != null && na === nb) return true;
  // Trimmed string equivalence
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }
  return false;
}

function isEmpty(v: RawCellValue): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

function toNumber(v: RawCellValue): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function stringify(v: RawCellValue): string {
  if (v == null) return '∅';
  return String(v);
}
