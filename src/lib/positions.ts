/**
 * Phase B — Positions registry helpers.
 *
 * The MySQL `positions` table is authoritative. Catalog rows have
 * `school_id IS NULL` and are visible to every school; school-authored
 * custom rows have a non-null `school_id` and are visible only to that
 * school.
 */
import { query } from '@/lib/db';

export type PositionCategory =
  | 'academic'
  | 'admin'
  | 'finance'
  | 'support'
  | 'spiritual';

export interface PositionRow {
  id:             number;
  schoolId:       number | null;
  code:           string;
  name:           string;
  category:       PositionCategory;
  isTeaching:     boolean;
  defaultRoleId:  number | null;
  isActive:       boolean;
  displayOrder:   number;
}

interface RawPositionRow {
  id:               number;
  school_id:        number | null;
  code:             string;
  name:             string;
  category:         PositionCategory;
  is_teaching:      number;
  default_role_id:  number | null;
  is_active:        number;
  display_order:    number;
}

function toRow(r: RawPositionRow): PositionRow {
  return {
    id:             r.id,
    schoolId:       r.school_id,
    code:           r.code,
    name:           r.name,
    category:       r.category,
    isTeaching:     r.is_teaching === 1,
    defaultRoleId:  r.default_role_id,
    isActive:       r.is_active === 1,
    displayOrder:   r.display_order,
  };
}

/**
 * List positions visible to a school: global catalog (school_id NULL)
 * unioned with that school's custom rows. Sorted by display_order.
 */
export async function listPositions(args: {
  schoolId:    number;
  activeOnly?: boolean;
  category?:   PositionCategory;
}): Promise<PositionRow[]> {
  const where: string[] = ['(school_id IS NULL OR school_id = ?)'];
  const params: unknown[] = [args.schoolId];
  if (args.activeOnly !== false) where.push('is_active = 1');
  if (args.category) {
    where.push('category = ?');
    params.push(args.category);
  }
  const rows = (await query(
    `SELECT id, school_id, code, name, category, is_teaching,
            default_role_id, is_active, display_order
       FROM positions
      WHERE ${where.join(' AND ')}
      ORDER BY display_order ASC, name ASC`,
    params,
  )) as RawPositionRow[];
  return rows.map(toRow);
}

export async function findPositionByCode(args: {
  schoolId: number;
  code:     string;
}): Promise<PositionRow | null> {
  const rows = (await query(
    `SELECT id, school_id, code, name, category, is_teaching,
            default_role_id, is_active, display_order
       FROM positions
      WHERE code = ?
        AND (school_id IS NULL OR school_id = ?)
      ORDER BY school_id IS NULL ASC
      LIMIT 1`,
    [args.code, args.schoolId],
  )) as RawPositionRow[];
  return rows.length ? toRow(rows[0]) : null;
}

export async function findPositionById(id: number): Promise<PositionRow | null> {
  const rows = (await query(
    `SELECT id, school_id, code, name, category, is_teaching,
            default_role_id, is_active, display_order
       FROM positions
      WHERE id = ?
      LIMIT 1`,
    [id],
  )) as RawPositionRow[];
  return rows.length ? toRow(rows[0]) : null;
}
