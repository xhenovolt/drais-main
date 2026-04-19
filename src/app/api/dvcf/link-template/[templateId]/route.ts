import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { DRAIS_DEFAULT_DOCUMENT } from '@/lib/drce/defaults';

// ============================================================================
// GET /api/dvcf/link-template/[templateId]
//
// Finds or creates a dvcf_document linked to a report_template by ID.
// Uses template_key = 'kitchen_rpt_{templateId}' as the stable link.
// Returns { id: number } — the dvcf_document ID to navigate to.
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const { templateId } = await params;
    const tid = parseInt(templateId, 10);
    if (isNaN(tid)) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 });

    const templateKey = `kitchen_rpt_${tid}`;

    const conn = await getConnection();
    try {
      // Check for existing linked document
      const [existing] = await conn.execute(
        `SELECT id FROM dvcf_documents
         WHERE template_key = ? AND (school_id IS NULL OR school_id = ?)
         LIMIT 1`,
        [templateKey, schoolId],
      );

      const rows = existing as { id: number }[];
      if (rows.length > 0) {
        return NextResponse.json({ id: rows[0].id });
      }

      // Fetch the source report_template name for the new doc
      const [tmplRows] = await conn.execute(
        `SELECT name FROM report_templates WHERE id = ? AND (school_id IS NULL OR school_id = ?) LIMIT 1`,
        [tid, schoolId],
      );
      const name = ((tmplRows as { name: string }[])[0]?.name) ?? `Template ${tid}`;

      // Create a fresh DRCE document linked to this template
      const doc = structuredClone(DRAIS_DEFAULT_DOCUMENT);
      doc.meta.name = name;

      const [result] = await conn.execute(
        `INSERT INTO dvcf_documents
           (school_id, document_type, name, description, schema_json, schema_version, is_default, template_key)
         VALUES (?, 'report_card', ?, '', ?, 1, 0, ?)`,
        [schoolId, name, JSON.stringify(doc), templateKey],
      );

      const insertId = (result as { insertId: number }).insertId;
      return NextResponse.json({ id: insertId });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/link-template GET]', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
