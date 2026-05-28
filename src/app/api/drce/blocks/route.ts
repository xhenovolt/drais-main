/**
 * GET  /api/drce/blocks            — list blocks visible to this school
 * POST /api/drce/blocks            — create a new school-owned block
 *
 * Phase H. Blocks are reusable section subtrees (typically containers) that
 * documents reference via a `block_ref` section.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { listBlocks, createBlock, type BlockKind } from '@/lib/drce/blocks';
import type { DRCESection } from '@/lib/drce/schema';

const KINDS: BlockKind[] = ['header', 'footer', 'comment_rules', 'custom'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind');
  const kind = kindParam && KINDS.includes(kindParam as BlockKind) ? (kindParam as BlockKind) : undefined;
  const blocks = await listBlocks(session.schoolId, kind);
  return NextResponse.json({ success: true, blocks });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const name = String(body.name ?? '').trim().slice(0, 120);
  const kind = body.kind as BlockKind;
  const section = body.section as DRCESection;
  if (!name)               return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of ${KINDS.join(',')}` }, { status: 400 });
  if (!section || typeof section !== 'object' || !('type' in section)) {
    return NextResponse.json({ error: 'section is required (a DRCESection)' }, { status: 400 });
  }

  const created = await createBlock({
    schoolId:    session.schoolId,
    name,
    description: typeof body.description === 'string' ? body.description.slice(0, 255) : '',
    kind,
    section,
    createdBy:   session.userId,
  });
  return NextResponse.json({ success: true, id: created.id });
}
