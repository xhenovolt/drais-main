/**
 * Result-entry gating + manual-comment resolution (Phase 6).
 *
 * Pure, db-free logic so it can be unit-tested. Two concerns:
 *
 *  1. Who may enter/comment on a subject's results. Privileged users
 *     (super-admins, HODs, admins holding the allocations-manage grant) may
 *     touch any subject; an ordinary teacher may only touch subjects they are
 *     actively allocated to teach.
 *
 *  2. Manual vs automatic comment precedence. A teacher's typed comment always
 *     wins over the auto/rule-generated one; blank falls back to the auto text.
 */

export interface EnterSubjectContext {
  /** True for super-admins / users with the allocations-manage permission. */
  isPrivileged: boolean;
  /** Subject ids the caller is actively allocated to (for the target class). */
  allocatedSubjectIds: readonly number[];
  /** Subject being entered. */
  subjectId: number;
}

/**
 * Whether the caller may enter results / comments for `subjectId`.
 * Privileged callers always pass. Otherwise the subject must be in their
 * active allocation set for the class.
 */
export function canEnterSubject(ctx: EnterSubjectContext): boolean {
  if (ctx.isPrivileged) return true;
  return ctx.allocatedSubjectIds.includes(ctx.subjectId);
}

/**
 * A human-readable reason when entry is denied (null when allowed). Kept
 * separate from the boolean so the API can return a clear message.
 */
export function denyReason(ctx: EnterSubjectContext): string | null {
  return canEnterSubject(ctx)
    ? null
    : 'You are not allocated to teach this subject for this class, so you cannot enter its results or comments.';
}

/**
 * Resolve the comment stored on a result: a teacher's manual comment wins over
 * the auto/rule comment; a blank manual comment falls back to the auto text.
 * Returns null when neither is present (so the column stays empty and the
 * report-time default wording can apply).
 */
export function resolveManualComment(
  manual: string | null | undefined,
  auto: string | null | undefined,
): string | null {
  const m = (manual ?? '').trim();
  if (m) return m;
  const a = (auto ?? '').trim();
  return a || null;
}
