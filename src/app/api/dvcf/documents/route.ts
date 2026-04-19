import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseDRCERow, type DVCFDocumentRow } from '@/lib/drce/schema';
import { BUILT_IN_DOCUMENTS } from '@/lib/drce/defaults';

// ============================================================================
// GET  /api/dvcf/documents  — list all DVCF documents available to this school
// POST /api/dvcf/documents  — create a new DVCF document for this school
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, school_id, document_type, name, description,
                schema_json, schema_version, is_default, template_key,
                created_at, updated_at
         FROM dvcf_documents
         WHERE (school_id IS NULL OR school_id = ?)
         ORDER BY is_default DESC, id ASC`,
        [schoolId],
      );

      const documents = (rows as DVCFDocumentRow[]).map(parseDRCERow);
      return NextResponse.json({ success: true, documents });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/documents GET]', error);
    // Fallback to in-code built-ins when the table doesn't exist yet
    return NextResponse.json({ success: true, documents: BUILT_IN_DOCUMENTS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const body = await request.json();
    const { name, description, schema_json, document_type = 'report_card' } = body;

    if (!name || !schema_json) {
      return NextResponse.json({ error: 'name and schema_json are required' }, { status: 400 });
    }

    const schemaStr = typeof schema_json === 'string'
      ? schema_json
      : JSON.stringify(schema_json);

    const conn = await getConnection();
    try {
      const [result] = await conn.execute(
        `INSERT INTO dvcf_documents
           (school_id, document_type, name, description, schema_json, schema_version, is_default)
         VALUES (?, ?, ?, ?, ?, 1, 0)`,
        [schoolId, document_type, name, description ?? '', schemaStr],
      );

      return NextResponse.json({
        success: true,
        id: (result as { insertId: number }).insertId,
        message: 'Document created',
      });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/documents POST]', error);
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }
}
