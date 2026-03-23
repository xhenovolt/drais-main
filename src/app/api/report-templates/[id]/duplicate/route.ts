import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseTemplateRow } from '@/lib/reportTemplates';

// ============================================================================
// POST /api/report-templates/[id]/duplicate
// Duplicates a template and assigns it to the current school
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const newName: string = body?.name || '';

    const conn = await getConnection();
    try {
      // Fetch source template
      const [rows] = await conn.execute(
        `SELECT id, name, description, layout_json FROM report_templates
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
        [id, schoolId]
      );
      if (!(rows as any[]).length) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const source = (rows as any[])[0];
      const duplicateName = newName || `${source.name} (Copy)`;

      const [result] = await conn.execute(
        `INSERT INTO report_templates (name, description, layout_json, is_default, school_id)
         VALUES (?, ?, ?, 0, ?)`,
        [duplicateName, source.description || '', source.layout_json, schoolId]
      );

      return NextResponse.json({
        success: true,
        id: (result as any).insertId,
        name: duplicateName,
        message: 'Template duplicated',
      });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to duplicate template', details: error.message }, { status: 500 });
  }
}
