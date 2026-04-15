import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseTemplateRow, DEFAULT_TEMPLATE_JSON, MODERN_CLEAN_TEMPLATE_JSON, NORTHGATE_TEMPLATE_JSON } from '@/lib/reportTemplates';

// ============================================================================
// GET /api/report-templates  — list all templates available to this school
// POST /api/report-templates — create a new custom template
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const conn = await getConnection();
    try {
      // Get global templates (school_id IS NULL) + school-specific templates
      const [rows] = await conn.execute(
        `SELECT id, name, description, layout_json, is_default, school_id, template_key, created_at, updated_at
         FROM report_templates
         WHERE school_id IS NULL OR school_id = ?
         ORDER BY is_default DESC, id ASC`,
        [schoolId]
      );

      const templates = (rows as any[]).map(parseTemplateRow);
      return NextResponse.json({ success: true, templates });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    console.error('[report-templates GET]', error);
    // Return built-in templates as fallback when DB table doesn't exist yet
    return NextResponse.json({
      success: true,
      templates: [
        { id: 1, name: 'Default Template', description: 'Classic DRAIS report card.', layout_json: DEFAULT_TEMPLATE_JSON, is_default: true, school_id: null },
        { id: 2, name: 'Modern Clean Template', description: 'Contemporary teal-green design.', layout_json: MODERN_CLEAN_TEMPLATE_JSON, is_default: false, school_id: null },
        { id: 3, name: 'Northgate School Template', description: 'Traditional Northgate style — blue banner, maroon values, grey ribbons.', layout_json: NORTHGATE_TEMPLATE_JSON, is_default: false, school_id: null },
      ],
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await request.json();
    const { name, description, layout_json } = body;

    if (!name || !layout_json) {
      return NextResponse.json({ error: 'name and layout_json are required' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      const layoutStr = typeof layout_json === 'string'
        ? layout_json
        : JSON.stringify(layout_json);

      const [result] = await conn.execute(
        `INSERT INTO report_templates (name, description, layout_json, is_default, school_id)
         VALUES (?, ?, ?, 0, ?)`,
        [name, description || '', layoutStr, schoolId]
      );

      return NextResponse.json({
        success: true,
        id: (result as any).insertId,
        message: 'Template created',
      });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    console.error('[report-templates POST]', error);
    return NextResponse.json({ error: 'Failed to create template', details: error.message }, { status: 500 });
  }
}
