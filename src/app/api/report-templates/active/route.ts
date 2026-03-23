import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { DEFAULT_TEMPLATE_JSON, parseTemplateRow } from '@/lib/reportTemplates';

// ============================================================================
// GET  /api/report-templates/active  — get the active template for this school
// POST /api/report-templates/active  — set a template as active for this school
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const conn = await getConnection();
    try {
      // Look up active template id from school_settings
      const [settingRows] = await conn.execute(
        `SELECT value_text FROM school_settings
         WHERE school_id = ? AND key_name = 'active_report_template_id'
         LIMIT 1`,
        [schoolId]
      );

      let templateId: number | null = null;
      if ((settingRows as any[]).length > 0) {
        templateId = parseInt((settingRows as any[])[0].value_text, 10) || null;
      }

      if (templateId) {
        const [rows] = await conn.execute(
          `SELECT id, name, description, layout_json, is_default, school_id
           FROM report_templates
           WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
          [templateId, schoolId]
        );
        if ((rows as any[]).length > 0) {
          return NextResponse.json({ success: true, template: parseTemplateRow((rows as any[])[0]) });
        }
      }

      // Fallback: get the default template
      const [defaultRows] = await conn.execute(
        `SELECT id, name, description, layout_json, is_default, school_id
         FROM report_templates
         WHERE is_default = 1 AND school_id IS NULL
         LIMIT 1`
      );

      if ((defaultRows as any[]).length > 0) {
        return NextResponse.json({ success: true, template: parseTemplateRow((defaultRows as any[])[0]) });
      }

      // If table doesn't exist or is empty, return built-in default
      return NextResponse.json({
        success: true,
        template: {
          id: 1,
          name: 'Default Template',
          description: 'Classic DRAIS report card.',
          layout_json: DEFAULT_TEMPLATE_JSON,
          is_default: true,
          school_id: null,
        },
      });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    console.error('[report-templates/active GET]', error);
    // Graceful fallback when table doesn't exist yet
    return NextResponse.json({
      success: true,
      template: {
        id: 1,
        name: 'Default Template',
        description: 'Classic DRAIS report card.',
        layout_json: DEFAULT_TEMPLATE_JSON,
        is_default: true,
        school_id: null,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await request.json();
    const { template_id } = body;

    if (!template_id) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      // Validate template exists and is accessible to this school
      const [rows] = await conn.execute(
        `SELECT id FROM report_templates WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
        [template_id, schoolId]
      );
      if (!(rows as any[]).length) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      // Upsert into school_settings
      await conn.execute(
        `INSERT INTO school_settings (school_id, key_name, value_text)
         VALUES (?, 'active_report_template_id', ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [schoolId, String(template_id)]
      );

      return NextResponse.json({ success: true, message: 'Active template updated' });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    console.error('[report-templates/active POST]', error);
    return NextResponse.json({ error: 'Failed to set active template', details: error.message }, { status: 500 });
  }
}
