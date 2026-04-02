import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// ============================================================================
// GET  /api/report-templates/[id]/versions — list versions (newest first)
// POST /api/report-templates/[id]/versions — create a version snapshot
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, template_id, version, layout_json, change_note, created_by, created_at
         FROM report_template_versions
         WHERE template_id = ?
         ORDER BY version DESC
         LIMIT 50`,
        [id]
      );
      const versions = (rows as any[]).map(row => ({
        ...row,
        layout_json: typeof row.layout_json === 'string'
          ? JSON.parse(row.layout_json)
          : row.layout_json,
      }));
      return NextResponse.json({ success: true, versions });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch versions', details: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { layout_json, change_note } = body;

    if (!layout_json) {
      return NextResponse.json({ error: 'layout_json required' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      // Get next version number
      const [maxRows] = await conn.execute(
        `SELECT COALESCE(MAX(version), 0) AS max_ver FROM report_template_versions WHERE template_id = ?`,
        [id]
      );
      const nextVersion = ((maxRows as any[])[0]?.max_ver ?? 0) + 1;

      const layoutStr = typeof layout_json === 'string' ? layout_json : JSON.stringify(layout_json);

      await conn.execute(
        `INSERT INTO report_template_versions (template_id, version, layout_json, change_note, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [id, nextVersion, layoutStr, change_note || null, session.userId ?? null]
      );

      return NextResponse.json({ success: true, version: nextVersion });
    } finally {
      await conn.end();
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save version', details: error.message }, { status: 500 });
  }
}
