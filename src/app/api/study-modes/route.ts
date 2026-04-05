import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Study Modes API
 * GET  /api/study-modes  — List study modes for school (falls back to system defaults)
 * POST /api/study-modes  — Create a new study mode for the school
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    // Return school-specific modes; if none exist, return system defaults (school_id IS NULL)
    const [schoolModes]: any = await conn.execute(
      `SELECT id, school_id, name, is_default, is_active
       FROM study_modes
       WHERE school_id = ? AND is_active = 1
       ORDER BY is_default DESC, name ASC`,
      [schoolId]
    );

    if (schoolModes.length > 0) {
      return NextResponse.json({ success: true, data: schoolModes });
    }

    // Fallback: system defaults
    const [systemModes]: any = await conn.execute(
      `SELECT id, school_id, name, is_default, is_active
       FROM study_modes
       WHERE school_id IS NULL AND is_active = 1
       ORDER BY is_default DESC, name ASC`
    );

    return NextResponse.json({ success: true, data: systemModes });
  } catch (error) {
    console.error('Error fetching study modes:', error);
    return NextResponse.json({ error: 'Failed to fetch study modes' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const name = (body.name ?? '').toString().trim();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const isDefault = body.is_default ? 1 : 0;

    const [result]: any = await conn.execute(
      `INSERT INTO study_modes (school_id, name, is_default, is_active) VALUES (?, ?, ?, 1)`,
      [schoolId, name, isDefault]
    );

    return NextResponse.json({
      success: true,
      data: { id: result.insertId, school_id: schoolId, name, is_default: isDefault, is_active: 1 },
    }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'A study mode with that name already exists' }, { status: 409 });
    }
    console.error('Error creating study mode:', error);
    return NextResponse.json({ error: 'Failed to create study mode' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function DELETE(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const id = req.nextUrl.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });

    await conn.execute(
      `UPDATE study_modes SET is_active = 0 WHERE id = ? AND school_id = ?`,
      [id, schoolId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting study mode:', error);
    return NextResponse.json({ error: 'Failed to delete study mode' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function PATCH(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const id = body.id ? parseInt(body.id, 10) : null;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];

    if (body.name !== undefined) {
      const name = body.name.toString().trim();
      if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      updates.push('name = ?');
      params.push(name);
    }
    if (body.is_default !== undefined) {
      // Clear existing default for this school first, then set the new one
      if (body.is_default) {
        await conn.execute(
          `UPDATE study_modes SET is_default = 0 WHERE school_id = ?`,
          [schoolId]
        );
      }
      updates.push('is_default = ?');
      params.push(body.is_default ? 1 : 0);
    }

    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id, schoolId);
    await conn.execute(
      `UPDATE study_modes SET ${updates.join(', ')} WHERE id = ? AND school_id = ?`,
      params
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'A study mode with that name already exists' }, { status: 409 });
    }
    console.error('Error updating study mode:', error);
    return NextResponse.json({ error: 'Failed to update study mode' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
