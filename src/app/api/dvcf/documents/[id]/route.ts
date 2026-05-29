import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { parseDRCERow, type DVCFDocumentRow } from '@/lib/drce/schema';
import { getBuiltInDocument } from '@/lib/drce/defaults';
import { isTemplateCategory } from '@/lib/drce/registry';
import { resolveBuiltInDocument } from '@/lib/drce/builtin-resolver';
import { snapshotVersion } from '@/lib/drce/versions';
import { resolveInheritance, resolveBlockRefs } from '@/lib/drce/inheritance';
import { listBlocks } from '@/lib/drce/blocks';
import { requirePermission } from '@/lib/rbac';

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

    // Phase 3.3 — resolve string-id built-ins (e.g. 'drce-emergency-secular')
    // before attempting the numeric DB lookup. Built-ins are ambient and
    // available to every school, so no school_id filter applies.
    const builtIn = resolveBuiltInDocument(id);
    if (builtIn) {
      return NextResponse.json({ success: true, document: builtIn });
    }

    const docId = parseInt(id, 10);
    if (isNaN(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, school_id, document_type, name, description,
                schema_json, schema_version, is_default, template_key,
                template_category, parent_id, status, created_at, updated_at
         FROM dvcf_documents
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)
         LIMIT 1`,
        [docId, schoolId],
      );

      const list = rows as DVCFDocumentRow[];
      if (list.length === 0) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      let doc = parseDRCERow(list[0]);

      // Phase H — opt-in resolution. ?resolved=1 returns the document with
      // parent inheritance applied + block_refs inlined. The editor fetches
      // the raw form (default) so authors edit only what THIS document owns;
      // the print/render path requests the resolved form so the renderer
      // sees the full tree.
      const url = new URL(request.url);
      if (url.searchParams.get('resolved') === '1') {
        doc = await resolveInheritance(doc, schoolId);
        const blocks = await listBlocks(schoolId);
        doc = resolveBlockRefs(doc, blocks);
      }

      return NextResponse.json({ success: true, document: doc });
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
    // P4 — drce.edit gates updates. Super-admin bypasses.
    try {
      await requirePermission(session.userId, session.schoolId, 'drce.edit', session.isSuperAdmin);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    const { schoolId } = session;

    const { id } = await params;
    const docId = parseInt(id, 10);
    if (isNaN(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await request.json();
    const { name, description, schema_json, template_category: rawCategory, parent_id } = body;

    if (!name && !schema_json && rawCategory === undefined && parent_id === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    if (rawCategory !== undefined && !isTemplateCategory(rawCategory)) {
      return NextResponse.json(
        { error: 'Invalid template_category' },
        { status: 400 },
      );
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
      if (rawCategory !== undefined) {
        setClauses.push('template_category = ?');
        values.push(rawCategory);
      }
      // Phase H — template inheritance. parent_id may be a numeric id (set),
      // null (clear), or undefined (leave unchanged). Self-reference is
      // rejected to avoid the obvious 1-step cycle; deeper cycles are
      // tolerated and broken by resolveInheritance's MAX_DEPTH + visited set.
      if (parent_id !== undefined) {
        const pid = parent_id === null ? null : Number(parent_id);
        if (pid !== null && pid === docId) {
          return NextResponse.json({ error: 'A document cannot inherit from itself' }, { status: 400 });
        }
        setClauses.push('parent_id = ?');
        values.push(pid);
      }

      values.push(docId, schoolId);

      await conn.execute(
        `UPDATE dvcf_documents
         SET ${setClauses.join(', ')}
         WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
        values,
      );

      // Phase F: snapshot a version whenever schema_json changed. Fire-and-
      // forget — a versioning failure must NEVER block the user's save.
      let version_no: number | undefined;
      if (schema_json !== undefined) {
        try {
          const snap = await snapshotVersion({
            documentId:    docId,
            schemaJson:    typeof schema_json === 'string' ? schema_json : JSON.stringify(schema_json),
            name:          name ?? null,
            authorUserId:  session.userId,
            changeSummary: typeof body.change_summary === 'string' ? body.change_summary.slice(0, 255) : null,
          });
          version_no = snap.version_no;
        } catch (e) {
          console.warn('[dvcf/documents/[id] PUT] version snapshot failed', e);
        }
      }

      return NextResponse.json({ success: true, message: 'Document updated', version_no });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/documents/[id] PUT]', error);
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
  }
}

/* P4 — drce.admin gates delete. Falls through to existing 403 on missing perm. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    try {
      await requirePermission(session.userId, session.schoolId, 'drce.admin', session.isSuperAdmin);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
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
