/**
 * Pure allocation logic (Phase 3/8/9).
 *
 * These functions hold the decision rules for the many-to-many teacher
 * allocation model so they can be unit-tested without a database. The API
 * routes translate DB rows into these shapes and apply the results:
 *   - report-card initials composition (mirrors the SQL in snapshots/queries.ts)
 *   - which extra primaries must be demoted when a new primary is set
 *   - allocation-health warnings (no primary / multiple primaries / missing initials)
 *
 * Keep this module free of any `@/lib/db` import so it stays client-safe and
 * cheap to test.
 */

export const ALLOCATION_ROLES = [
  'primary_teacher',
  'assistant_teacher',
  'practical_teacher',
  'theory_teacher',
  'examiner',
  'substitute',
  'hod',
] as const;

export type AllocationRole = (typeof ALLOCATION_ROLES)[number];

/** Fall back to assistant_teacher for unknown/blank roles. */
export function normalizeRole(role: unknown): AllocationRole {
  return (ALLOCATION_ROLES as readonly string[]).includes(role as string)
    ? (role as AllocationRole)
    : 'assistant_teacher';
}

export interface AllocRow {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  allocation_role: string;
  /** Explicit initials override; blank/undefined falls back to auto. */
  custom_initials?: string | null;
  /** Auto initials derived from the teacher name (may be null when no teacher). */
  auto_initials?: string | null;
  /** Full teacher name, used only to know whether ANY initials are derivable. */
  teacher_name?: string | null;
  /** 1 = shown on report card, 0 = hidden. Missing is treated as shown. */
  display_on_report?: number | null;
}

const isActivePrimary = (r: { allocation_role: string }) => r.allocation_role === 'primary_teacher';
const isShown = (r: { display_on_report?: number | null }) =>
  r.display_on_report === undefined || r.display_on_report === null || Number(r.display_on_report) === 1;

/**
 * Stable ordering for a subject's teachers: primary first, then by id ascending.
 * Mirrors `ORDER BY (allocation_role='primary_teacher') DESC, id ASC` in SQL so
 * re-generated report snapshots stay byte-identical.
 */
export function orderTeachers<T extends { id: number; allocation_role: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = isActivePrimary(a) ? 0 : 1;
    const pb = isActivePrimary(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

/** One teacher's report initials: custom override wins, else auto from name. */
export function initialsFor(r: AllocRow): string {
  const custom = (r.custom_initials || '').trim();
  if (custom) return custom;
  return (r.auto_initials || '').trim();
}

/**
 * Compose the report-card initials string for a subject's teachers, e.g.
 * "A.N / S.K". Only report-visible rows are included, primary first. Rows that
 * resolve to no initials are skipped. Returns '' when nothing is renderable.
 */
export function composeReportInitials(rows: AllocRow[], separator = ' / '): string {
  return orderTeachers(rows.filter(isShown))
    .map(initialsFor)
    .filter((s) => s.length > 0)
    .join(separator);
}

/**
 * Given a subject's current teachers and the row that should be the sole
 * primary (keepId), return the ids of the OTHER active primaries to demote.
 * If keepId is null, every primary is returned (caller may demote all).
 */
export function primariesToDemote(rows: AllocRow[], keepId: number | null): number[] {
  return rows
    .filter((r) => isActivePrimary(r) && r.id !== keepId)
    .map((r) => r.id);
}

export interface WarningItem {
  class_id: number;
  subject_id: number;
  count?: number;
  teachers?: number;
}
export interface AllocationWarnings {
  no_primary: WarningItem[];
  multiple_primary: WarningItem[];
  missing_initials: WarningItem[];
}

/**
 * Classify a school's ACTIVE allocation rows into health warnings.
 * Rows must already be filtered to active (valid, status='active'). Grouping is
 * by (class_id, subject_id).
 */
export function classifyWarnings(rows: AllocRow[]): AllocationWarnings {
  const byCS = new Map<string, AllocRow[]>();
  for (const r of rows) {
    const k = `${r.class_id}__${r.subject_id}`;
    const list = byCS.get(k);
    if (list) list.push(r);
    else byCS.set(k, [r]);
  }

  const out: AllocationWarnings = { no_primary: [], multiple_primary: [], missing_initials: [] };
  for (const list of byCS.values()) {
    const primaries = list.filter(isActivePrimary);
    const one = list[0];
    const key = { class_id: one.class_id, subject_id: one.subject_id };
    if (primaries.length === 0) out.no_primary.push({ ...key, teachers: list.length });
    if (primaries.length > 1) out.multiple_primary.push({ ...key, count: primaries.length });
    for (const r of list) {
      if (isShown(r) && !initialsFor(r) && !(r.teacher_name || '').trim()) {
        out.missing_initials.push({ ...key });
        break; // one flag per subject is enough
      }
    }
  }
  return out;
}
