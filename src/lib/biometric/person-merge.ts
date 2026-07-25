/**
 * Guided Person Merge (Founder-Independence Phase B).
 *
 * Duplicate person records (same human entered twice — "MULEMA PAUL" ×2) split
 * attendance and corrupt analytics. Consolidating them used to need scripts.
 * This makes it a safe, previewable, audited admin workflow built on the
 * existing reattributePerson engine:
 *   detect same-name duplicates → pick the keeper → preview what moves →
 *   merge (move all attendance from losers into the keeper, then soft-delete
 *   the loser records). Reversible: losers are soft-deleted (restorable) and
 *   every move is audited; raw events are never deleted.
 *
 * normalizeName() + groupDuplicates() are PURE and unit-tested.
 */
import { query } from '@/lib/db';

/** PURE: canonical name key for duplicate grouping (case/space/punct-insensitive). */
export function normalizeName(first?: string | null, other?: string | null, last?: string | null): string {
  return [first, other, last].filter(Boolean).join(' ')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export interface DupMember { person_id: number; role: 'staff' | 'student' | 'none'; ref_id: number | null; }
/** PURE: group members by normalized name; return only groups with 2+. */
export function groupDuplicates(people: Array<{ person_id: number; first_name?: string; other_name?: string; last_name?: string; role: 'staff' | 'student' | 'none'; ref_id: number | null }>): Array<{ name: string; members: DupMember[] }> {
  const map = new Map<string, DupMember[]>();
  for (const p of people) {
    const key = normalizeName(p.first_name, p.other_name, p.last_name);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ person_id: p.person_id, role: p.role, ref_id: p.ref_id });
  }
  return [...map.entries()]
    .filter(([, m]) => m.length > 1)
    .map(([name, members]) => ({ name, members }));
}

/** Detect duplicate-name people in a school, with role + attendance weight so
 *  the admin can pick a sensible keeper (most attendance / has enrollment). */
export async function findDuplicatePeople(schoolId: number, limit = 50) {
  const rows = (await query(
    `SELECT p.id AS person_id, p.first_name, p.other_name, p.last_name,
            st.id AS staff_id, s.id AS student_id,
            (SELECT COUNT(*) FROM attendance_raw_events ar WHERE ar.person_id = p.id) AS events,
            (SELECT COUNT(*) FROM biometric_enrollments be WHERE be.person_id = p.id AND be.status IN ('active','pending_capture')) AS enrollments
       FROM people p
       LEFT JOIN staff st ON st.person_id = p.id AND st.school_id = p.school_id AND st.deleted_at IS NULL
       LEFT JOIN students s ON s.person_id = p.id AND s.school_id = p.school_id AND s.deleted_at IS NULL
      WHERE p.school_id = ? AND p.deleted_at IS NULL`,
    [schoolId],
  )) as any[];

  const enriched = rows.map(r => ({
    person_id: Number(r.person_id), first_name: r.first_name, other_name: r.other_name, last_name: r.last_name,
    role: (r.staff_id ? 'staff' : r.student_id ? 'student' : 'none') as 'staff' | 'student' | 'none',
    ref_id: r.staff_id ? Number(r.staff_id) : r.student_id ? Number(r.student_id) : null,
    events: Number(r.events || 0), enrollments: Number(r.enrollments || 0),
    name: [r.first_name, r.other_name, r.last_name].filter(Boolean).join(' '),
  }));

  const byId = new Map(enriched.map(e => [e.person_id, e]));
  const groups = groupDuplicates(enriched)
    // Only mergeable groups: at least one member has a role to keep.
    .filter(g => g.members.some(m => m.role !== 'none'))
    .slice(0, limit)
    .map(g => ({
      name: g.name,
      members: g.members.map(m => byId.get(m.person_id)!).sort((a, b) => (b.enrollments - a.enrollments) || (b.events - a.events)),
    }));
  return groups;
}

/** Preview a merge: how much attendance moves from losers into the keeper. */
export async function previewMerge(schoolId: number, keeperPersonId: number, loserPersonIds: number[]) {
  const ids = loserPersonIds.filter(n => Number.isFinite(n) && n !== keeperPersonId);
  if (!ids.length) return { ok: false as const, reason: 'Select at least one duplicate to merge in' };
  const ph = ids.map(() => '?').join(',');
  const agg = (await query(
    `SELECT COUNT(*) events, COUNT(DISTINCT person_id) people FROM attendance_raw_events WHERE school_id = ? AND person_id IN (${ph})`,
    [schoolId, ...ids],
  )) as any[];
  const recs = (await query(
    `SELECT COUNT(*) n FROM attendance_records WHERE school_id = ? AND person_id IN (${ph})`,
    [schoolId, ...ids],
  )) as any[];
  return { ok: true as const, losers: ids.length, events: Number(agg[0]?.events || 0), records: Number(recs[0]?.n || 0) };
}

/** Merge losers into the keeper: move all attendance, then soft-delete losers. */
export async function mergePeople(args: {
  schoolId: number; keeperRole: 'staff' | 'student'; keeperRefId: number; keeperPersonId: number;
  loserPersonIds: number[]; actorUserId?: number | null;
}): Promise<{ ok: boolean; reason?: string; merged: number; events: number; records: number }> {
  const ids = args.loserPersonIds.filter(n => Number.isFinite(n) && n !== args.keeperPersonId);
  if (!ids.length) return { ok: false, reason: 'no losers', merged: 0, events: 0, records: 0 };

  const { reattributePerson } = await import('@/lib/biometric/identity-correction');
  let merged = 0, events = 0, records = 0;
  for (const loser of ids) {
    const res = await reattributePerson({
      schoolId: args.schoolId, fromPersonId: loser,
      toRoleType: args.keeperRole, toRoleRefId: args.keeperRefId,
      reason: `merge duplicate → person ${args.keeperPersonId}`, actorUserId: args.actorUserId ?? null,
    });
    if (res.ok) {
      events += res.rawEvents; records += res.records; merged++;
      // Soft-delete the loser's role row + person (restorable via Trash).
      await query(`UPDATE staff SET deleted_at = NOW(), deleted_by = ? WHERE person_id = ? AND school_id = ? AND deleted_at IS NULL`, [args.actorUserId ?? null, loser, args.schoolId]).catch(() => {});
      await query(`UPDATE students SET deleted_at = NOW(), deleted_by = ? WHERE person_id = ? AND school_id = ? AND deleted_at IS NULL`, [args.actorUserId ?? null, loser, args.schoolId]).catch(() => {});
      await query(`UPDATE people SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND school_id = ? AND deleted_at IS NULL`, [args.actorUserId ?? null, loser, args.schoolId]).catch(() => {});
    }
  }
  return { ok: true, merged, events, records };
}
