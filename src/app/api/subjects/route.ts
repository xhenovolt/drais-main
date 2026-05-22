import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getConnection, getActiveDatabase } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getSessionSchoolId } from '@/lib/auth';
import { getAllocationsBySubject } from '@/lib/academic-allocation';

/**
 * Self-heal: if id column lacks AUTO_INCREMENT, recreate the table.
 * TiDB doesn't support ALTER TABLE MODIFY ... AUTO_INCREMENT,
 * so we must DROP/RECREATE with data migration.
 * Returns true if AUTO_INCREMENT is now available.
 */
async function selfHealAutoIncrement(conn: any): Promise<boolean> {
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM subjects WHERE Field = 'id'");
    const col = (cols as any[])[0];
    if (col && col.Extra?.includes('auto_increment')) {
      return true;
    }
    console.log('[self-heal] subjects: id column missing AUTO_INCREMENT, recreating table...');
    const db = await getActiveDatabase();
    if (db === 'mysql') {
      await conn.query('ALTER TABLE subjects MODIFY id BIGINT NOT NULL AUTO_INCREMENT');
    } else {
      // TiDB: must recreate — drop leftover temp table from any prior failed attempt
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      await conn.query('DROP TABLE IF EXISTS _subjects_new');
      await conn.query(`CREATE TABLE _subjects_new (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        school_id BIGINT NOT NULL DEFAULT 1,
        name VARCHAR(120) NOT NULL,
        code VARCHAR(20) DEFAULT NULL,
        subject_type VARCHAR(20) DEFAULT 'core',
        academic_type ENUM('secular','theology') NOT NULL DEFAULT 'secular',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_school_type (school_id, subject_type),
        INDEX idx_school_academic (school_id, academic_type),
        INDEX idx_code (code),
        UNIQUE KEY unique_school_subject (school_id, name, deleted_at)
      )`);
      await conn.query(`INSERT IGNORE INTO _subjects_new (id, school_id, name, code, subject_type, academic_type, created_at, updated_at, deleted_at)
        SELECT id, school_id, name, code, subject_type,
          COALESCE(academic_type, 'secular'),
          created_at, updated_at, deleted_at
        FROM subjects`);
      await conn.query('DROP TABLE subjects');
      await conn.query('ALTER TABLE _subjects_new RENAME TO subjects');
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    console.log('[self-heal] subjects: table fixed successfully');
    return true;
  } catch (e: any) {
    console.error('[self-heal] subjects failed:', e.message);
    return false;
  }
}

/**
 * Fallback insert: explicitly generate the next id when AUTO_INCREMENT is unavailable.
 */
async function insertWithExplicitId(conn: any, schoolId: number, name: string, code: string | null, subjectType: string, academicType: string = 'secular') {
  const [maxRows] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM subjects');
  const nextId = (maxRows as any[])[0].next_id;
  return await conn.query(
    'INSERT INTO subjects (id, school_id, name, code, subject_type, academic_type) VALUES (?, ?, ?, ?, ?, ?)',
    [nextId, schoolId, name, code, subjectType, academicType]
  );
}

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get('type');
    const academicTypeFilter = searchParams.get('academic_type');
    const searchFilter = searchParams.get('search') || '';
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const rawPage = pageParam ? Number.parseInt(pageParam, 10) : NaN;
    const rawLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
    const usePagination = Number.isFinite(rawPage) && rawPage > 0 && Number.isFinite(rawLimit) && rawLimit > 0;
    const page = usePagination ? rawPage : 1;
    const limit = usePagination ? rawLimit : null;
    const offset = usePagination && limit ? (page - 1) * limit : 0;

    connection = await getConnection();
    const [subjectRows]: any = await connection.execute(
      `SELECT id, name, code, subject_type, academic_type
       FROM subjects
       WHERE school_id = ? AND deleted_at IS NULL
       ORDER BY name ASC`,
      [schoolId]
    );

    const allocationSummaries = await getAllocationsBySubject(schoolId);
    const allocationsBySubjectId = new Map(
      allocationSummaries.map(summary => [summary.subjectId, summary])
    );

    let filtered = (subjectRows as any[]).filter(subject => {
      if (typeFilter && subject.subject_type !== typeFilter) {
        return false;
      }

      if (academicTypeFilter && ['secular', 'theology'].includes(academicTypeFilter) && subject.academic_type !== academicTypeFilter) {
        return false;
      }

      if (searchFilter.trim() && !subject.name.toLowerCase().includes(searchFilter.toLowerCase())) {
        return false;
      }

      return true;
    });

    // Apply pagination
    const total = filtered.length;
    if (usePagination && limit) {
      filtered = filtered.slice(offset, offset + limit);
    }

    // Transform to response format (matching original API contract)
    const data = filtered.map(subject => {
      const summary = allocationsBySubjectId.get(subject.id);
      return {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        subject_type: subject.subject_type,
        academic_type: subject.academic_type,
        allocated_classes: summary && summary.allocatedClasses.length > 0 ? summary.allocatedClasses.join(', ') : null,
        allocation_count: summary?.allocationCount || 0,
        allocated_teachers: summary && summary.allocatedTeachers.length > 0 ? summary.allocatedTeachers.join(', ') : null
      };
    });

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      pages: usePagination && limit ? Math.ceil(total / limit) : 1
    });
  } catch (e: any) {
    console.error('Subjects GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    const id = body.id;
    const name = (body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Subject name is required' }, { status: 400 });
    }
    const code = (body.code || '').trim() || null;
    const subject_type = body.subject_type || 'core';
    const academic_type: string = body.academic_type || 'secular';

    const validTypes = ['core', 'elective', 'tahfiz', 'extra'];
    if (!validTypes.includes(subject_type)) {
      return NextResponse.json({
        error: `Invalid subject_type. Must be one of: ${validTypes.join(', ')}`
      }, { status: 400 });
    }

    if (!['secular', 'theology'].includes(academic_type)) {
      return NextResponse.json({
        error: 'Invalid academic_type. Must be secular or theology'
      }, { status: 400 });
    }

    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    if (id) {
      // Update — enforce tenant isolation
      await connection.execute(
        'UPDATE subjects SET name=?, code=?, subject_type=?, academic_type=? WHERE id=? AND school_id=?',
        [name, code, subject_type, academic_type, id, schoolId]
      );
      return NextResponse.json({ success: true, id });
    }

    // Check duplicate (only active subjects - exclude soft-deleted)
    // Use LOWER() to ensure case-insensitive matching (e.g., "English" vs "ENGLISH")
    const [dup] = await connection.execute(
      'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?) AND school_id = ? AND deleted_at IS NULL',
      [name, schoolId]
    );
    if ((dup as any[]).length) {
      return NextResponse.json({ error: `A subject with the name "${name}" already exists for this school.` }, { status: 409 });
    }

    // Insert — use query() (text protocol) to avoid TiDB prepared stmt cache issues
    const insertFn = async () => {
      return await connection.query(
        'INSERT INTO subjects (school_id, name, code, subject_type, academic_type) VALUES (?, ?, ?, ?, ?)',
        [schoolId, name, code, subject_type, academic_type]
      );
    };

    let result;
    try {
      [result] = await insertFn();
    } catch (insertErr: any) {
      if (insertErr.errno === 1364 /* ER_NO_DEFAULT_FOR_FIELD */) {
        const healed = await selfHealAutoIncrement(connection);
        if (healed) {
          try {
            [result] = await insertFn();
          } catch {
            [result] = await insertWithExplicitId(connection, schoolId, name, code, subject_type, academic_type);
          }
        } else {
          [result] = await insertWithExplicitId(connection, schoolId, name, code, subject_type, academic_type);
        }
      } else {
        throw insertErr;
      }
    }
    return NextResponse.json({ success: true, id: (result as any).insertId }, { status: 201 });
  } catch (e: any) {
    console.error('Subjects POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();
    
    // Soft delete: mark as deleted instead of removing
    await connection.execute('UPDATE subjects SET deleted_at = CURRENT_TIMESTAMP WHERE id=? AND school_id=?', [id, schoolId]);
    
    // Log audit trail
    await logAudit(session.userId, 'SUBJECT_DELETED', { subjectId: id, schoolId });
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Subjects DELETE error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
