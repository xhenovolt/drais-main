import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  
  try {
    const session = await getSessionSchoolId(req);
    // Allow unauthenticated access — return empty flags list for public/signup pages
    if (!session) {
      return NextResponse.json({ success: true, data: [] });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const includeExpired = searchParams.get('include_expired') === 'true';

    connection = await getConnection();

    let sql = `
      SELECT 
        id,
        route_name,
        route_path,
        label,
        description,
        is_new,
        is_enabled,
        version_tag,
        category,
        priority,
        date_added,
        expires_at
      FROM feature_flags 
      WHERE is_enabled = 1
    `;

    const params: any[] = [];

    if (schoolId !== null) {
      sql += ' AND (school_id = ? OR school_id IS NULL)';
      params.push(schoolId);
    } else {
      sql += ' AND schoolId IS NULL';
    }

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (!includeExpired) {
      sql += ' AND (expires_at IS NULL OR expires_at > NOW())';
    }

    sql += ' ORDER BY priority DESC, date_added DESC';

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows
    });

  } catch (error: any) {
    console.error('Feature flags fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch feature flags'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const { 
      route_name, 
      route_path, 
      label, 
      description, 
      is_new = false,
      category = 'general',
      priority = 0,
      expires_in_days = 14
    } = body;

    if (!route_name || !route_path || !label) {
      return NextResponse.json({
        success: false,
        error: 'Route name, path, and label are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const expiresAt = expires_in_days > 0 
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
      : null;

    await connection.execute(`
      INSERT INTO feature_flags (
        schoolId, route_name, route_path, label, description, 
        is_new, category, priority, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        route_path = VALUES(route_path),
        label = VALUES(label),
        description = VALUES(description),
        is_new = VALUES(is_new),
        category = VALUES(category),
        priority = VALUES(priority),
        expires_at = VALUES(expires_at),
        updated_at = CURRENT_TIMESTAMP
    `, [
      schoolId, route_name, route_path, label, description,
      is_new, category, priority, expiresAt
    ]);

    return NextResponse.json({
      success: true,
      message: 'Feature flag created/updated successfully'
    });

  } catch (error: any) {
    console.error('Feature flag creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create feature flag'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
