import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseDRCERow, type DVCFDocumentRow } from '@/lib/drce/schema';
import { BUILT_IN_DOCUMENTS } from '@/lib/drce/defaults';
import { isTemplateCategory, type TemplateCategory } from '@/lib/drce/registry';
import { requirePermission } from '@/lib/rbac';

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
                template_category, status, document_kind, created_at, updated_at
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
    // drce.templates.create gates create (the real catalog code; `drce.*`
    // covers it for admins). Super-admin bypasses.
    try {
      await requirePermission(session.userId, session.schoolId, 'drce.templates.create', session.isSuperAdmin);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    const { schoolId } = session;

    const body = await request.json();
    const {
      name, description, schema_json,
      document_type = 'report_card',
      template_category: rawCategory,
      document_kind: rawKind,
    } = body;

    if (!name || !schema_json) {
      return NextResponse.json({ error: 'name and schema_json are required' }, { status: 400 });
    }

    // Phase 2 — every new row carries an explicit category. Default to
    // 'custom' for school-authored documents (the school owns it) and
    // reject anything that doesn't pass the type guard.
    let templateCategory: TemplateCategory = 'custom';
    if (rawCategory !== undefined) {
      if (!isTemplateCategory(rawCategory)) {
        return NextResponse.json(
          { error: `Invalid template_category. Expected one of standard|emergency|legacy_rpt|drce|arabic|custom` },
          { status: 400 },
        );
      }
      templateCategory = rawCategory;
    }

    const schemaStr = typeof schema_json === 'string'
      ? schema_json
      : JSON.stringify(schema_json);

    // Round 1 — document_kind is free-text (school-extensible). Normalise to
    // safe identifier shape; fall back to 'report' so legacy callers stay
    // bug-compatible.
    const documentKind = typeof rawKind === 'string' && rawKind.trim()
      ? rawKind.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 64)
      : 'report';

    const conn = await getConnection();
    try {
      const [result] = await conn.execute(
        `INSERT INTO dvcf_documents
           (school_id, document_type, name, description, schema_json,
            schema_version, is_default, template_category, document_kind)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [schoolId, document_type, name, description ?? '', schemaStr, templateCategory, documentKind],
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
