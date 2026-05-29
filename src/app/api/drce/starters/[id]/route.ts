/**
 * GET /api/drce/starters/:id  → { success, document, kind, name }
 *
 * Returns the materialised DRCEDocument for one starter. Used by the gallery
 * to create-and-open a new template in the editor:
 *   user picks starter → POST /api/dvcf/documents with the resolved schema +
 *                        document_kind → navigate to /reports/kitchen/drce/<newId>.
 *
 * The id is either:
 *   • a built-in starter code  → resolved from src/lib/drce/starters.ts
 *   • `db:<numeric>`           → resolved from drce_starters
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { findStarter } from '@/lib/drce/starters';
import type { DRCEDocument } from '@/lib/drce/schema';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const idStr = decodeURIComponent(id);

  if (idStr.startsWith('db:')) {
    const numericId = Number(idStr.slice(3));
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const rows = (await query(
      `SELECT id, school_id, document_kind, name, schema_json
         FROM drce_starters
        WHERE id = ? AND is_active = 1
          AND (school_id IS NULL OR school_id = ?)
        LIMIT 1`,
      [numericId, session.schoolId],
    )) as Array<{ id: number; document_kind: string; name: string; schema_json: string }>;
    if (!rows.length) return NextResponse.json({ error: 'Starter not found' }, { status: 404 });
    const r = rows[0];
    const doc = JSON.parse(r.schema_json) as DRCEDocument;
    return NextResponse.json({ success: true, document: doc, kind: r.document_kind, name: r.name });
  }

  const builtIn = findStarter(idStr);
  if (!builtIn) return NextResponse.json({ error: 'Starter not found' }, { status: 404 });
  return NextResponse.json({
    success:  true,
    document: builtIn.build(),
    kind:     builtIn.kind,
    name:     builtIn.name,
  });
}
