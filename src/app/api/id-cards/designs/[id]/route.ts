/**
 * GET    /api/id-cards/designs/:id
 * PUT    /api/id-cards/designs/:id   { name?, spec?, setActive? }
 * DELETE /api/id-cards/designs/:id   (soft delete)
 * Every query is scoped to the caller's school.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { sanitizeSpec } from '@/lib/idcards/spec';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { hydrateDesign as hydrate } from '@/lib/idcards/designs';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, schoolId: number) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const rows = (await query(
    `SELECT id, name, spec_json, source_kind FROM id_card_designs WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [n, schoolId],
  )) as any[];
  return rows[0] ?? null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const row = await load((await ctx.params).id, s.schoolId);
  if (!row) return NextResponse.json({ error: 'Design not found' }, { status: 404 });
  return NextResponse.json({ success: true, design: hydrate(row) });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const row = await load((await ctx.params).id, s.schoolId);
  if (!row) return NextResponse.json({ error: 'Design not found' }, { status: 404 });
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const sets: string[] = []; const params: any[] = [];
  if (typeof body.name === 'string' && body.name.trim()) { sets.push('name = ?'); params.push(body.name.trim().slice(0, 160)); }
  if (body.spec !== undefined) {
    try { params.push(JSON.stringify(sanitizeSpec(body.spec))); sets.push('spec_json = ?'); }
    catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  }
  if (body.setActive === true) {
    await query('UPDATE id_card_designs SET is_active = 0 WHERE school_id = ?', [s.schoolId]);
    sets.push('is_active = 1');
  }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  sets.push('updated_by = ?'); params.push(s.userId);
  await query(`UPDATE id_card_designs SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, [...params, row.id, s.schoolId]);
  await logAudit({ schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_DESIGN_UPDATED', entityType: 'id_card_design', entityId: row.id });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const row = await load((await ctx.params).id, s.schoolId);
  if (!row) return NextResponse.json({ error: 'Design not found' }, { status: 404 });
  await query(`UPDATE id_card_designs SET deleted_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ? AND school_id = ?`, [row.id, s.schoolId]);
  await logAudit({ schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_DESIGN_DELETED', entityType: 'id_card_design', entityId: row.id });
  return NextResponse.json({ success: true });
}
