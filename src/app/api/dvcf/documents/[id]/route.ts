import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseDRCERow, type DVCFDocumentRow } from '@/lib/drce/schema';
import { getBuiltInDocument } from '@/lib/drce/defaults';

// ============================================================================
// GET    /api/dvcf/documents/[id]  — get a single DVCF document
// PUT    /api/dvcf/documents/[id]  — update a DVCF document (school-owned only)
// DELETE /api/dvcf/documents/[id]  — delete a DVCF document (school-owned only)
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const { id } = await params;
    const docId = parseInt(id, 10);
    if (isNaN(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, school_id, document_type, name, description,
                schema_json, schema_version, is_default, template_key,
                created_at, updated_at
         FROM dvcf_documents
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)
         LIMIT 1`,
        [docId, schoolId],
      );

      const list = rows as DVCFDocumentRow[];
      if (list.length === 0) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, document: parseDRCERow(list[0]) });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/documents/[id] GET]', error);
    // Try built-in fallback
    const { id } = await params;
    const builtIn = getBuiltInDocument(parseInt(id, 10));
    if (builtIn) return NextResponse.json({ success: true, document: builtIn });
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const { id } = await params;
    const docId = parseInt(id, 10);
    if (isNaN(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await request.json();
    const { name, description, schema_json } = body;

    if (!name && !schema_json) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      // Verify ownership — only school-owned documents can be edited
      const [check] = await conn.execute(
        `SELECT id, school_id FROM dvcf_documents WHERE id = ? LIMIT 1`,
        [docId],
      );
      const row = (check as Array<{ id: number; school_id: number | null }>)[0];
      if (!row) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      if (row.school_id !== null && row.school_id !== schoolId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Build the SET clause dynamically
      const setClauses: string[] = [];
      const values: (string | number | null)[] = [];

      if (name !== undefined) { setClauses.push('name = ?'); values.push(name); }
      if (description !== undefined) { setClauses.push('description = ?'); values.push(description); }
      if (schema_json !== undefined) {
        setClauses.push('schema_json = ?, schema_version = schema_version + 1');
        values.push(typeof schema_json === 'string' ? schema_json : JSON.stringify(schema_json));
      }

      values.push(docId, schoolId);

      await conn.execute(
        `UPDATE dvcf_documents
         SET ${setClauses.join(', ')}
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
        values,
      );

      return NextResponse.json({ success: true, message: 'Document updated' });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/documents/[id] PUT]', error);
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const { id } = await params;
    const docId = parseInt(id, 10);
    if (isNaN(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const conn = await getConnection();
    try {
      // Only allow deleting school-owned documents, not global defaults
      const [result] = await conn.execute(
        `DELETE FROM dvcf_documents
         WHERE id = ? AND school_id = ?`,
        [docId, schoolId],
      );

      const affected = (result as { affectedRows: number }).affectedRows;
      if (affected === 0) {
        return NextResponse.json(
          { error: 'Document not found or is a global template that cannot be deleted' },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, message: 'Document deleted' });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/documents/[id] DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
