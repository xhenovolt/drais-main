/**
 * GET  /api/id-cards/designs            — list this school's designs (no spec).
 * GET  /api/id-cards/designs?active=1   — the active design with its spec.
 * POST /api/id-cards/designs            — create { name, spec, sourceKind?, setActive? }.
 *
 * The legacy /api/id-card-templates flow is untouched and keeps working.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { sanitizeSpec, type SourceKind } from '@/lib/idcards/spec';
import { hydrateDesign as hydrate } from '@/lib/idcards/designs';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const KINDS: SourceKind[] = ['designed', 'imported', 'legacy'];

export async function GET(req: NextRequest) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;

  if (req.nextUrl.searchParams.get('active') === '1') {
    const rows = (await query(
      `SELECT id, name, spec_json, source_kind FROM id_card_designs
        WHERE school_id = ? AND deleted_at IS NULL AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`,
      [s.schoolId],
    ).catch(() => [])) as any[];
    if (!rows[0]) return NextResponse.json({ success: true, design: null });
    return NextResponse.json({ success: true, design: hydrate(rows[0]) });
  }

  const rows = (await query(
    `SELECT id, name, source_kind, is_active, updated_at FROM id_card_designs
      WHERE school_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 100`,
    [s.schoolId],
  ).catch(() => [])) as any[];
  return NextResponse.json({ success: true, designs: rows });
}

export async function POST(req: NextRequest) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'A design name is required' }, { status: 400 });
  }
  let spec;
  try { spec = sanitizeSpec(body.spec); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const kind: SourceKind = KINDS.includes(body.sourceKind) ? body.sourceKind : 'designed';

  if (body.setActive) await query('UPDATE id_card_designs SET is_active = 0 WHERE school_id = ?', [s.schoolId]);
  const res = (await query(
    `INSERT INTO id_card_designs (school_id, name, spec_json, source_kind, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [s.schoolId, body.name.trim().slice(0, 160), JSON.stringify(spec), kind, body.setActive ? 1 : 0, s.userId, s.userId],
  )) as unknown as { insertId?: number };
  await logAudit({
    schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_DESIGN_CREATED', entityType: 'id_card_design',
    entityId: res?.insertId ?? null, details: { twoSided: !!spec.back, sourceKind: kind },
  });
  return NextResponse.json({ success: true, id: res?.insertId, spec });
}
