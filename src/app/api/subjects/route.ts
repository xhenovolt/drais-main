import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getConnection, getActiveDatabase } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Self-heal: if id column lacks AUTO_INCREMENT, recreate the table.
 * TiDB doesn't support ALTER TABLE MODIFY ... AUTO_INCREMENT,
 * so we must DROP/RECREATE with data migration.
 */
async function selfHealAutoIncrement(conn: any) {
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM subjects WHERE Field = 'id'");
    const col = (cols as any[])[0];
    if (col && col.Extra?.includes('auto_increment')) {
      return;
    }
    console.log('[self-heal] subjects: id column missing AUTO_INCREMENT, recreating table...');
    const db = await getActiveDatabase();
    if (db === 'mysql') {
      await conn.query('ALTER TABLE subjects MODIFY id BIGINT NOT NULL AUTO_INCREMENT');
    } else {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      await conn.query(`CREATE TABLE IF NOT EXISTS _subjects_new (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        school_id BIGINT NOT NULL DEFAULT 1,
        name VARCHAR(120) NOT NULL,
        code VARCHAR(20) DEFAULT NULL,
        subject_type VARCHAR(20) DEFAULT 'core',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_school_type (school_id, subject_type),
        INDEX idx_code (code),
        UNIQUE KEY unique_school_subject (school_id, name)
      )`);
      await conn.query('INSERT IGNORE INTO _subjects_new (id, school_id, name, code, subject_type, created_at, updated_at) SELECT id, school_id, name, code, subject_type, created_at, updated_at FROM subjects');
      await conn.query('DROP TABLE subjects');
      await conn.query('ALTER TABLE _subjects_new RENAME TO subjects');
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    console.log('[self-heal] subjects: table fixed successfully');
  } catch (e: any) {
    console.error('[self-heal] subjects failed:', e.message);
  }
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
    const type = searchParams.get('type');

    connection = await getConnection();

    let sql = 'SELECT id, name, code, subject_type FROM subjects WHERE school_id = ?';
    const params: any[] = [schoolId];

    if (type) {
      sql += ' AND subject_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY name ASC';
    const [rows] = await connection.execute(sql, params);
    return NextResponse.json({ data: rows });
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

    const validTypes = ['core', 'elective', 'tahfiz', 'extra'];
    if (!validTypes.includes(subject_type)) {
      return NextResponse.json({
        error: `Invalid subject_type. Must be one of: ${validTypes.join(', ')}`
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
        'UPDATE subjects SET name=?, code=?, subject_type=? WHERE id=? AND school_id=?',
        [name, code, subject_type, id, schoolId]
      );
      return NextResponse.json({ success: true, id });
    }

    // Check duplicate
    const [dup] = await connection.execute(
      'SELECT id FROM subjects WHERE name = ? AND school_id = ?',
      [name, schoolId]
    );
    if ((dup as any[]).length) {
      return NextResponse.json({ error: 'A subject with this name already exists.' }, { status: 409 });
    }

    // Insert — use query() (text protocol) to avoid TiDB prepared stmt cache issues
    const insertFn = async () => {
      return await connection.query(
        'INSERT INTO subjects (school_id, name, code, subject_type) VALUES (?, ?, ?, ?)',
        [schoolId, name, code, subject_type]
      );
    };

    try {
      const [result] = await insertFn();
      return NextResponse.json({ success: true, id: (result as any).insertId }, { status: 201 });
    } catch (insertErr: any) {
      if (insertErr.errno === 1364 /* ER_NO_DEFAULT_FOR_FIELD */) {
        await selfHealAutoIncrement(connection);
        const [result] = await insertFn();
        return NextResponse.json({ success: true, id: (result as any).insertId }, { status: 201 });
      }
      throw insertErr;
    }
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
    await connection.execute('DELETE FROM subjects WHERE id=? AND school_id=?', [id, schoolId]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Subjects DELETE error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
