/**
 * DRAIS Term Engine — Phase 3
 * Provides time-aware term resolution so the whole system
 * always knows "what term are we in right now?"
 */

import { getConnection } from './db';

export interface Term {
  id: number;
  school_id: number;
  academic_year_id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'closed';
  academic_year_name: string;
}

/**
 * Returns the current active term for a school.
 *
 * Priority:
 *   1. Term whose date range contains today AND status = 'active'
 *   2. Term with status = 'active' (regardless of date)
 *   3. Most recent term by start_date (fallback — never returns null)
 */
export async function getCurrentTerm(schoolId: number = 1): Promise<Term | null> {
  const conn = await getConnection();
  try {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // Priority 1: date-range match + active status
    const [byDate] = await conn.execute<any[]>(
      `SELECT t.*, ay.name AS academic_year_name
       FROM terms t
       JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE t.school_id = ?
         AND t.status = 'active'
         AND t.start_date <= ?
         AND t.end_date >= ?
         AND t.deleted_at IS NULL
       ORDER BY t.start_date DESC
       LIMIT 1`,
      [schoolId, today, today]
    );
    if ((byDate as any[]).length > 0) return (byDate as any[])[0] as Term;

    // Priority 2: any active term
    const [anyActive] = await conn.execute<any[]>(
      `SELECT t.*, ay.name AS academic_year_name
       FROM terms t
       JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE t.school_id = ?
         AND t.status = 'active'
         AND t.deleted_at IS NULL
       ORDER BY t.start_date DESC
       LIMIT 1`,
      [schoolId]
    );
    if ((anyActive as any[]).length > 0) return (anyActive as any[])[0] as Term;

    // Priority 3: latest term regardless of status
    const [latest] = await conn.execute<any[]>(
      `SELECT t.*, ay.name AS academic_year_name
       FROM terms t
       JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE t.school_id = ?
         AND t.deleted_at IS NULL
       ORDER BY t.start_date DESC
       LIMIT 1`,
      [schoolId]
    );
    return (latest as any[]).length > 0 ? ((latest as any[])[0] as Term) : null;
  } finally {
    await conn.end();
  }
}

/**
 * Returns all terms for a school, grouped by academic year.
 */
export async function getAllTerms(schoolId: number = 1) {
  const conn = await getConnection();
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT t.*, ay.name AS academic_year_name
       FROM terms t
       JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE t.school_id = ? AND t.deleted_at IS NULL
       ORDER BY ay.start_date DESC, t.start_date ASC`,
      [schoolId]
    );
    return rows;
  } finally {
    await conn.end();
  }
}

/**
 * Returns all academic years for a school.
 */
export async function getAcademicYears(schoolId: number = 1) {
  const conn = await getConnection();
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT * FROM academic_years
       WHERE school_id = ? AND deleted_at IS NULL
       ORDER BY start_date DESC`,
      [schoolId]
    );
    return rows;
  } finally {
    await conn.end();
  }
}
