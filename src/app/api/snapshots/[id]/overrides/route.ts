import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import {
  listOverrides,
  upsertOverride,
  clearOverrides,
  verifySnapshotOwnership,
} from '@/lib/snapshots/overrides';
import {
  isOverrideKind,
  type OverrideKind,
  type RenderOverride,
} from '@/lib/drce/overrides';

/**
 * Phase 3.1 — per-snapshot override CRUD.
 *
 *   GET    /api/snapshots/[id]/overrides
 *           ?student_db_id=<n>   restrict to one learner (plus snapshot-wide)
 *           ?student_db_id=null  return only snapshot-wide entries
 *   POST   /api/snapshots/[id]/overrides    upsert one override
 *   DELETE /api/snapshots/[id]/overrides    clear by scope
 *
 * School scoping is enforced on every operation via
 * `verifySnapshotOwnership`. A snapshot id from another tenant resolves
 * to 404, never 403, to avoid leaking the existence of foreign rows.
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id: snapshotId } = await ctx.params;
  if (!await verifySnapshotOwnership(snapshotId, session.schoolId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const studentRaw = sp.get('student_db_id');
  let studentDbId: number | null | undefined;
  if (studentRaw === null) {
    studentDbId = undefined;
  } else if (studentRaw === 'null') {
    studentDbId = null;
  } else {
    const n = Number(studentRaw);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: 'Invalid student_db_id' }, { status: 400 });
    }
    studentDbId = n;
  }

  const overrides = await listOverrides({
    snapshotId,
    schoolId: session.schoolId,
    studentDbId,
  });
  return NextResponse.json({ success: true, overrides });
}

interface UpsertBody {
  student_db_id?: number | null;
  kind:           OverrideKind;
  target_id:      string;
  payload?:       unknown;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id: snapshotId } = await ctx.params;
  if (!await verifySnapshotOwnership(snapshotId, session.schoolId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: UpsertBody;
  try {
    body = await req.json() as UpsertBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isOverrideKind(body.kind)) {
    return NextResponse.json(
      { error: `Invalid kind. Expected one of ${['hide_section','hide_row','hide_subject','style_patch','text_replace','spacing_patch'].join('|')}` },
      { status: 400 },
    );
  }
  if (typeof body.target_id !== 'string' || body.target_id.length === 0) {
    return NextResponse.json({ error: 'target_id required' }, { status: 400 });
  }
  if (body.target_id.length > 64) {
    return NextResponse.json({ error: 'target_id too long (max 64)' }, { status: 400 });
  }

  const studentDbId =
    body.student_db_id === null || body.student_db_id === undefined
      ? null
      : Number(body.student_db_id);
  if (studentDbId !== null && !Number.isFinite(studentDbId)) {
    return NextResponse.json({ error: 'Invalid student_db_id' }, { status: 400 });
  }

  // Build the typed override. Payload validation is per-kind so a
  // malformed payload cannot land in the JSON column.
  let override: RenderOverride;
  switch (body.kind) {
    case 'hide_section':
    case 'hide_row':
    case 'hide_subject':
      override = { kind: body.kind, targetId: body.target_id };
      break;
    case 'style_patch': {
      if (!body.payload || typeof body.payload !== 'object') {
        return NextResponse.json({ error: 'style_patch requires object payload' }, { status: 400 });
      }
      override = {
        kind: 'style_patch',
        targetId: body.target_id,
        payload: body.payload as Record<string, unknown>,
      };
      break;
    }
    case 'text_replace': {
      const p = body.payload as { search?: unknown; replace?: unknown } | null;
      if (!p || typeof p.search !== 'string' || typeof p.replace !== 'string') {
        return NextResponse.json(
          { error: 'text_replace requires { search: string, replace: string }' },
          { status: 400 },
        );
      }
      override = {
        kind: 'text_replace',
        targetId: body.target_id,
        payload: { search: p.search, replace: p.replace },
      };
      break;
    }
    case 'spacing_patch': {
      const p = body.payload as { padding?: unknown; margin?: unknown } | null;
      override = {
        kind: 'spacing_patch',
        targetId: body.target_id,
        payload: {
          padding: typeof p?.padding === 'string' ? p.padding : undefined,
          margin:  typeof p?.margin  === 'string' ? p.margin  : undefined,
        },
      };
      break;
    }
  }

  const overrideId = await upsertOverride({
    snapshotId,
    studentDbId,
    override,
    createdBy: session.userId,
  });

  return NextResponse.json({ success: true, overrideId });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id: snapshotId } = await ctx.params;
  if (!await verifySnapshotOwnership(snapshotId, session.schoolId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const studentRaw = sp.get('student_db_id');
  const kindRaw    = sp.get('kind');

  let studentDbId: number | null | undefined;
  if (studentRaw === null)        studentDbId = undefined;
  else if (studentRaw === 'null') studentDbId = null;
  else {
    const n = Number(studentRaw);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: 'Invalid student_db_id' }, { status: 400 });
    }
    studentDbId = n;
  }

  let overrideKind: OverrideKind | undefined;
  if (kindRaw !== null) {
    if (!isOverrideKind(kindRaw)) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }
    overrideKind = kindRaw;
  }

  const removed = await clearOverrides({
    snapshotId,
    schoolId: session.schoolId,
    studentDbId,
    overrideKind,
  });
  return NextResponse.json({ success: true, removed });
}
