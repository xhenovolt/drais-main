/**
 * GET  /api/drce/starters       — list every starter visible to the caller's
 *                                  school (built-ins + own custom starters).
 *                                  Optional ?kind=certificate filter.
 *
 * POST /api/drce/starters       — save the current document as a custom
 *                                  starter for the school.
 *                                  body: { name, kind, fromDocumentId | schemaJson, description? }
 *                                  Requires `drce.edit`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query, getConnection } from '@/lib/db';
import { BUILT_IN_STARTERS } from '@/lib/drce/starters';
import { normalizeKind, findKind } from '@/lib/drce/kinds';
import type { DRCEDocument } from '@/lib/drce/schema';

interface StarterRow {
  id: number;
  school_id: number | null;
  document_kind: string;
  name: string;
  description: string | null;
  schema_json: string;
  thumbnail_url: string | null;
  sort_order: number;
  is_active: number;
}

interface StarterPayload {
  /** Stable id — code for built-ins, `db:${row.id}` for DB rows. */
  id:            string;
  source:        'built-in' | 'school';
  name:          string;
  description:   string;
  kind:          string;
  kindLabel:     string;
  kindIcon:      string;
  sortOrder:     number;
  thumbnailUrl:  string | null;
  /** Sentinel — clients fetch the schema only when actually picking a starter. */
  hasSchema:     boolean;
}

function builtInToPayload(s: typeof BUILT_IN_STARTERS[number]): StarterPayload {
  const k = findKind(s.kind);
  return {
    id:           s.code,
    source:       'built-in',
    name:         s.name,
    description:  s.description,
    kind:         s.kind,
    kindLabel:    k.label,
    kindIcon:     k.icon,
    sortOrder:    s.sortOrder,
    thumbnailUrl: null,
    hasSchema:    true,
  };
}

function rowToPayload(r: StarterRow): StarterPayload {
  const k = findKind(r.document_kind);
  return {
    id:           `db:${r.id}`,
    source:       'school',
    name:         r.name,
    description:  r.description ?? '',
    kind:         r.document_kind,
    kindLabel:    k.label,
    kindIcon:     k.icon,
    sortOrder:    r.sort_order,
    thumbnailUrl: r.thumbnail_url,
    hasSchema:    true,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const kindFilter = sp.get('kind')?.trim().toLowerCase() || null;

  // Built-ins
  let builtIns = BUILT_IN_STARTERS.map(builtInToPayload);
  if (kindFilter) builtIns = builtIns.filter(s => s.kind === kindFilter);

  // School-owned + global (school_id NULL) custom starters from DB. Wrapped in
  // try/catch because the table may not exist on the very first deploy — the
  // gallery should still surface built-ins.
  let rows: StarterRow[] = [];
  try {
    const sql = kindFilter
      ? `SELECT id, school_id, document_kind, name, description, schema_json,
                thumbnail_url, sort_order, is_active
           FROM drce_starters
           WHERE is_active = 1
             AND (school_id IS NULL OR school_id = ?)
             AND document_kind = ?
           ORDER BY sort_order ASC, name ASC`
      : `SELECT id, school_id, document_kind, name, description, schema_json,
                thumbnail_url, sort_order, is_active
           FROM drce_starters
           WHERE is_active = 1
             AND (school_id IS NULL OR school_id = ?)
           ORDER BY document_kind ASC, sort_order ASC, name ASC`;
    const params = kindFilter ? [session.schoolId, kindFilter] : [session.schoolId];
    rows = (await query(sql, params)) as StarterRow[];
  } catch (e) {
    console.warn('[drce/starters GET] db read skipped:', (e as Error).message);
  }

  const dbStarters = rows.map(rowToPayload);
  const all = [...builtIns, ...dbStarters].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder,
  );
  return NextResponse.json({ success: true, starters: all });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'drce.edit', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?:           string;
    kind?:           string;
    description?:    string;
    fromDocumentId?: number;
    schemaJson?:     string | DRCEDocument;
    sortOrder?:      number;
  } | null;
  if (!body?.name || !body.kind) {
    return NextResponse.json({ error: 'name and kind are required' }, { status: 400 });
  }

  let schemaStr: string;
  if (body.schemaJson) {
    schemaStr = typeof body.schemaJson === 'string'
      ? body.schemaJson
      : JSON.stringify(body.schemaJson);
  } else if (body.fromDocumentId) {
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT schema_json FROM dvcf_documents
          WHERE id = ? AND (school_id IS NULL OR school_id = ?) LIMIT 1`,
        [body.fromDocumentId, session.schoolId],
      );
      const r = (rows as Array<{ schema_json: string }>)[0];
      if (!r) return NextResponse.json({ error: 'Source document not found' }, { status: 404 });
      schemaStr = typeof r.schema_json === 'string' ? r.schema_json : JSON.stringify(r.schema_json);
    } finally {
      await conn.end();
    }
  } else {
    return NextResponse.json({ error: 'fromDocumentId or schemaJson required' }, { status: 400 });
  }

  const kind = normalizeKind(body.kind);
  try {
    const r = (await query(
      `INSERT INTO drce_starters
         (school_id, document_kind, name, description, schema_json, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         schema_json = VALUES(schema_json),
         sort_order  = VALUES(sort_order),
         updated_at  = CURRENT_TIMESTAMP`,
      [
        session.schoolId, kind, body.name.trim(),
        body.description?.toString().trim() || null,
        schemaStr,
        Number(body.sortOrder ?? 100),
        session.userId ?? null,
      ],
    )) as { insertId?: number };
    return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Failed to save starter' }, { status: 500 });
  }
}
