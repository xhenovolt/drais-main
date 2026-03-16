import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getConnection, getActiveDatabase } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Self-heal: if id column lacks AUTO_INCREMENT, recreate the table.
 * TiDB doesn't support ALTER TABLE MODIFY ... AUTO_INCREMENT,
 * so we must DROP/RECREATE with data migration.
 * Returns true if AUTO_INCREMENT is now available.
 */
async function selfHealAutoIncrement(conn: any): Promise<boolean> {
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM streams WHERE Field = 'id'");
    const col = (cols as any[])[0];
    if (col && col.Extra?.includes('auto_increment')) {
      return true;
    }
    console.log('[self-heal] streams: id column missing AUTO_INCREMENT, recreating table...');
    const db = await getActiveDatabase();
    if (db === 'mysql') {
      await conn.query('ALTER TABLE streams MODIFY id BIGINT NOT NULL AUTO_INCREMENT');
    } else {
      // TiDB: must recreate — drop leftover temp table from any prior failed attempt
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      await conn.query('DROP TABLE IF EXISTS _streams_new');
      await conn.query(`CREATE TABLE _streams_new (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        school_id BIGINT NOT NULL DEFAULT 1,
        class_id BIGINT NOT NULL,
        name VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_school_class (school_id, class_id),
        UNIQUE KEY unique_class_stream (class_id, name)
      )`);
      await conn.query('INSERT IGNORE INTO _streams_new (id, school_id, class_id, name, created_at, updated_at) SELECT id, school_id, class_id, name, created_at, updated_at FROM streams');
      await conn.query('DROP TABLE streams');
      await conn.query('ALTER TABLE _streams_new RENAME TO streams');
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    console.log('[self-heal] streams: table fixed successfully');
    return true;
  } catch (e: any) {
    console.error('[self-heal] streams failed:', e.message);
    return false;
  }
}

/**
 * Fallback insert: explicitly generate the next id when AUTO_INCREMENT is unavailable.
 */
async function insertWithExplicitId(conn: any, name: string, classId: number, schoolId: number) {
  const [maxRows] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM streams');
  const nextId = (maxRows as any[])[0].next_id;
  return await conn.query(
    'INSERT INTO streams (id, name, class_id, school_id) VALUES (?, ?, ?, ?)',
    [nextId, name, classId, schoolId]
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
    const classId = searchParams.get('class_id');

    connection = await getConnection();
    let sql = 'SELECT id, name, class_id FROM streams WHERE school_id = ?';
    const params: any[] = [schoolId];

    if (classId) {
      sql += ' AND class_id = ?';
      params.push(classId);
    }

    sql += ' ORDER BY name ASC';
    const [rows] = await connection.execute(sql, params);
    return NextResponse.json({ data: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Stream name is required.' }, { status: 400 });
    }
    if (!body.class_id) {
      return NextResponse.json({ error: 'class_id is required.' }, { status: 400 });
    }
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    // Validate class exists
    const [classes] = await connection.execute('SELECT id FROM classes WHERE id = ? AND school_id = ?', [body.class_id, schoolId]);
    if (!(classes as any[]).length) {
      return NextResponse.json({ error: 'Invalid class_id: class not found.' }, { status: 400 });
    }

    // Check unique(class_id, name)
    const [dup] = await connection.execute('SELECT id FROM streams WHERE class_id = ? AND name = ? AND school_id = ?', [body.class_id, body.name.trim(), schoolId]);
    if ((dup as any[]).length) {
      return NextResponse.json({ error: 'A stream with this name already exists in this class.' }, { status: 409 });
    }

    // Use query() (text protocol) — avoids TiDB prepared statement cache issues
    const insertFn = async () => {
      return await connection.query(
        'INSERT INTO streams (name, class_id, school_id) VALUES (?, ?, ?)',
        [body.name.trim(), body.class_id, schoolId]
      );
    };

    let result;
    try {
      [result] = await insertFn();
    } catch (insertErr: any) {
      if (insertErr.errno === 1364 /* ER_NO_DEFAULT_FOR_FIELD */) {
        const healed = await selfHealAutoIncrement(connection);
        if (healed) {
          // Self-heal succeeded — retry with AUTO_INCREMENT
          try {
            [result] = await insertFn();
          } catch {
            // AUTO_INCREMENT still not working — fall back to explicit id
            [result] = await insertWithExplicitId(connection, body.name.trim(), body.class_id, schoolId);
          }
        } else {
          // Self-heal failed — fall back to explicit id
          [result] = await insertWithExplicitId(connection, body.name.trim(), body.class_id, schoolId);
        }
      } else {
        throw insertErr;
      }
    }
    const insertId = (result as any).insertId;
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (e: any) {
    console.error('Streams POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const body = await req.json();
    if (!id || !body.name?.trim() || !body.class_id) {
      return NextResponse.json({ error: 'id, name and class_id required.' }, { status: 400 });
    }
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();
    await connection.execute('UPDATE streams SET name=?, class_id=? WHERE id=? AND school_id=?', [body.name.trim(), body.class_id, id, schoolId]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
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
      return NextResponse.json({ error: 'id required.' }, { status: 400 });
    }
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();
    await connection.execute('DELETE FROM streams WHERE id=? AND school_id=?', [id, schoolId]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
