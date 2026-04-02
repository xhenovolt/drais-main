import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseTemplateRow } from '@/lib/reportTemplates';

// ============================================================================
// GET    /api/report-templates/[id]  — fetch single template
// PUT    /api/report-templates/[id]  — update template
// DELETE /api/report-templates/[id]  — delete template (school-own only)
// POST   /api/report-templates/[id]/activate — set as active for school
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id } = await params;
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, name, description, layout_json, is_default, school_id
         FROM report_templates
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
        [id, schoolId]
      );
      if (!(rows as any[]).length) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, template: parseTemplateRow((rows as any[])[0]) });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch template', details: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id } = await params;
    const body = await request.json();
    const { name, description, layout_json } = body;

    const conn = await getConnection();
    try {
      const layoutStr = typeof layout_json === 'string'
        ? layout_json
        : JSON.stringify(layout_json);

      await conn.execute(
        `UPDATE report_templates
         SET name = ?, description = ?, layout_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
        [name, description || '', layoutStr, id, schoolId]
      );

      // Auto-save version snapshot
      try {
        const [maxRows] = await conn.execute(
          `SELECT COALESCE(MAX(version), 0) AS max_ver FROM report_template_versions WHERE template_id = ?`,
          [id]
        );
        const nextVersion = ((maxRows as any[])[0]?.max_ver ?? 0) + 1;
        await conn.execute(
          `INSERT INTO report_template_versions (template_id, version, layout_json, change_note, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [id, nextVersion, layoutStr, body.change_note || 'Auto-save', session.userId ?? null]
        );
      } catch {
        // Version save is best-effort — don't break the main save
      }

      return NextResponse.json({ success: true, message: 'Template updated' });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update template', details: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id } = await params;

    // Cannot delete global templates (school_id IS NULL) — only school-specific
    const conn = await getConnection();
    try {
      const [result] = await conn.execute(
        `DELETE FROM report_templates WHERE id = ? AND school_id = ?`,
        [id, schoolId]
      );
      if ((result as any).affectedRows === 0) {
        return NextResponse.json({ error: 'Cannot delete this template (global or not found)' }, { status: 403 });
      }
      return NextResponse.json({ success: true, message: 'Template deleted' });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete template', details: error.message }, { status: 500 });
  }
}
