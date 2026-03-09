import { getConnection } from '@/lib/db';

/**
 * Get the next sequential admission number for a school
 * Reads from students table and returns the next sequence number
 */
export async function getNextAdmissionNumber(schoolId: number = 1): Promise<number> {
  const connection = await getConnection();
  try {
    // Get the next sequence number by finding the max numeric part
    const [result]: any = await connection.execute(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(admission_no, '/', -2), '/', 1) AS UNSIGNED)), 0) + 1 as next_seq
       FROM students
       WHERE school_id = ? AND admission_no IS NOT NULL AND admission_no LIKE 'XHN/%'`,
      [schoolId]
    );
    
    return result[0]?.next_seq || 1;
  } catch (error) {
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Format admission number as: XHN/NNNN/YYYY
 * Example: XHN/0001/2026, XHN/0262/2026
 */
export function formatAdmissionNumber(sequenceNumber: number, schoolId: number = 1): string {
  // Format as XHN/0001/2026 style
  return `XHN/${sequenceNumber.toString().padStart(4, '0')}/2026`;
}

/**
 * Verify admission number is unique
 */
export async function isAdmissionNumberUnique(
  admissionNo: string,
  schoolId: number = 1,
  excludeStudentId?: number
): Promise<boolean> {
  const connection = await getConnection();
  try {
    let sql = 'SELECT COUNT(*) as count FROM students WHERE school_id = ? AND admission_no = ?';
    const params: any[] = [schoolId, admissionNo];

    if (excludeStudentId) {
      sql += ' AND id != ?';
      params.push(excludeStudentId);
    }

    const [result]: any = await connection.execute(sql, params);
    return result[0]?.count === 0;
  } finally {
    await connection.end();
  }
}

/**
 * Reassign sequential admission numbers based on admission date
 * This fixes existing data
 */
export async function reassignAdmissionNumbers(
  schoolId: number = 1,
  dryRun: boolean = false
): Promise<{
  updated: number;
  errors: Array<{ studentId: number; error: string }>;
  changes: Array<{ studentId: number; oldNo: string; newNo: string }>;
}> {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    // Get all students ordered by admission date
    const [students]: any = await connection.execute(
      `SELECT s.id, s.admission_no, s.admission_date
       FROM students
       WHERE school_id = ?
       AND deleted_at IS NULL
       ORDER BY s.admission_date ASC, s.id ASC`,
      [schoolId]
    );

    const changes: Array<{ studentId: number; oldNo: string; newNo: string }> = [];
    const errors: Array<{ studentId: number; error: string }> = [];
    let updated = 0;

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const newAdmissionNo = formatAdmissionNumber(i + 1, schoolId);

      if (student.admission_no !== newAdmissionNo) {
        try {
          if (!dryRun) {
            await connection.execute(
              'UPDATE students SET admission_no = ? WHERE id = ?',
              [newAdmissionNo, student.id]
            );
          }
          changes.push({
            studentId: student.id,
            oldNo: student.admission_no || 'NULL',
            newNo: newAdmissionNo,
          });
          updated++;
        } catch (error: any) {
          errors.push({
            studentId: student.id,
            error: error.message,
          });
        }
      }
    }

    if (!dryRun) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return { updated, errors, changes };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}
