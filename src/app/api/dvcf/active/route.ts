import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseDRCERow, type DVCFDocumentRow } from '@/lib/drce/schema';
import { DRAIS_DEFAULT_DOCUMENT } from '@/lib/drce/defaults';

// ============================================================================
// GET  /api/dvcf/active  — get the active DVCF document for this school
// POST /api/dvcf/active  — set a document as active for this school
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get('type') ?? 'report_card';

    const conn = await getConnection();
    try {
      // Look up active document id from dvcf_active_documents
      const [activeRows] = await conn.execute(
        `SELECT document_id
         FROM dvcf_active_documents
         WHERE school_id = ? AND document_type = ?
         LIMIT 1`,
        [schoolId, documentType],
      );

      let documentId: number | null = null;
      if ((activeRows as Array<{ document_id: number }>).length > 0) {
        documentId = (activeRows as Array<{ document_id: number }>)[0].document_id;
      }

      if (documentId) {
        const [rows] = await conn.execute(
          `SELECT id, school_id, document_type, name, description,
                  schema_json, schema_version, is_default, template_key,
                  created_at, updated_at
           FROM dvcf_documents
           WHERE id = ? AND (school_id IS NULL OR school_id = ?)
           LIMIT 1`,
          [documentId, schoolId],
        );

        if ((rows as DVCFDocumentRow[]).length > 0) {
          return NextResponse.json({
            success: true,
            document: parseDRCERow((rows as DVCFDocumentRow[])[0]),
          });
        }
      }

      // Fallback: return the global default document
      const [defaultRows] = await conn.execute(
        `SELECT id, school_id, document_type, name, description,
                schema_json, schema_version, is_default, template_key,
                created_at, updated_at
         FROM dvcf_documents
         WHERE is_default = 1 AND school_id IS NULL AND document_type = ?
         LIMIT 1`,
        [documentType],
      );

      if ((defaultRows as DVCFDocumentRow[]).length > 0) {
        return NextResponse.json({
          success: true,
          document: parseDRCERow((defaultRows as DVCFDocumentRow[])[0]),
        });
      }

      // Last resort: in-code default
      return NextResponse.json({ success: true, document: DRAIS_DEFAULT_DOCUMENT });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/active GET]', error);
    return NextResponse.json({ success: true, document: DRAIS_DEFAULT_DOCUMENT });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const body = await request.json();
    const { document_id, document_type = 'report_card' } = body;

    if (!document_id) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      // Verify the document exists and belongs to this school or is global
      const [check] = await conn.execute(
        `SELECT id FROM dvcf_documents
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)
         LIMIT 1`,
        [document_id, schoolId],
      );

      if ((check as unknown[]).length === 0) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      // Upsert the active document record
      await conn.execute(
        `INSERT INTO dvcf_active_documents (school_id, document_type, document_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE document_id = VALUES(document_id), updated_at = NOW()`,
        [schoolId, document_type, document_id],
      );

      return NextResponse.json({ success: true, message: 'Active document updated' });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/active POST]', error);
    return NextResponse.json({ error: 'Failed to set active document' }, { status: 500 });
  }
}
