/**
 * GET  /api/issuance/batches[?kind=...&status=...]
 *   List issuance batches visible to the caller's school.
 *
 * POST /api/issuance/batches
 *   body: { templateId, name, documentKind?, eligibility?, scope?,
 *           description?, issuedRunKey? }
 *   Creates a draft batch.
 *
 * Permissions: GET requires `issuance.view`; POST requires `issuance.create`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listBatches, createBatch } from '@/lib/issuance/engine';
import type { CreateBatchInput, IssuanceStatus } from '@/lib/issuance/types';
import { checkModule } from '@/lib/auth/requireModule';

const VALID_STATUSES: IssuanceStatus[] = ['draft','previewed','generating','generated','printed','failed','archived'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'inventory');
  if (modDenied) return modDenied;
  try {
    await requirePermission(session.userId, session.schoolId, 'issuance.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const kind   = sp.get('kind')   ?? undefined;
  const statusRaw = sp.get('status') ?? undefined;
  const status: IssuanceStatus | undefined =
    statusRaw && VALID_STATUSES.includes(statusRaw as IssuanceStatus)
      ? (statusRaw as IssuanceStatus)
      : undefined;
  const batches = await listBatches({ schoolId: session.schoolId, documentKind: kind, status });
  return NextResponse.json({ success: true, batches });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'inventory');
  if (modDenied) return modDenied;
  try {
    await requirePermission(session.userId, session.schoolId, 'issuance.create', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as CreateBatchInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const id = await createBatch({ schoolId: session.schoolId, userId: session.userId ?? null, input: body });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
