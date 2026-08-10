import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkAnyPermission } from '@/lib/rbac';
import {
  listEmploymentEvents,
  appendEmploymentEvent,
  isEmploymentEventType,
  type ContractType,
} from '@/lib/services/staff-employment';

/**
 * Phase C — Staff employment history endpoint.
 *
 *   GET  /api/admin/staff/[id]/employment
 *           → list every employment event for this staff (most-recent first)
 *
 *   POST /api/admin/staff/[id]/employment
 *           body: { event_type, effective_date?, end_date?, contract_type?,
 *                   salary_grade?, position_id?, department_id?, reason?, notes? }
 *           → append a new event and update cached staff.status
 *
 * School scoping is enforced by the service layer.
 */

const VALID_CONTRACT_TYPES: ContractType[] = [
  'permanent', 'fixed_term', 'contract', 'volunteer', 'part_time',
];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: idRaw } = await ctx.params;
  const staffId = Number(idRaw);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'Invalid staff id' }, { status: 400 });
  }

  const events = await listEmploymentEvents({
    staffId,
    schoolId: session.schoolId,
  });
  return NextResponse.json({ success: true, events });
}

interface PostBody {
  event_type:      string;
  effective_date?: string;
  end_date?:       string | null;
  contract_type?:  string | null;
  salary_grade?:   string | null;
  position_id?:    number | null;
  department_id?:  number | null;
  reason?:         string | null;
  notes?:          string | null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const denied = await checkAnyPermission(session.userId, session.schoolId, ['staff.employment.manage', 'staff.update'], session.isSuperAdmin);
  if (denied) return denied;
  const { id: idRaw } = await ctx.params;
  const staffId = Number(idRaw);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'Invalid staff id' }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = await req.json() as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isEmploymentEventType(body.event_type)) {
    return NextResponse.json(
      { error: `Invalid event_type. Expected one of hired|reactivated|suspended|on_leave|returned_from_leave|transferred|promoted|demoted|terminated` },
      { status: 400 },
    );
  }
  let contractType: ContractType | null = null;
  if (body.contract_type) {
    if (!(VALID_CONTRACT_TYPES as readonly string[]).includes(body.contract_type)) {
      return NextResponse.json({ error: 'Invalid contract_type' }, { status: 400 });
    }
    contractType = body.contract_type as ContractType;
  }

  try {
    const result = await appendEmploymentEvent({
      staffId,
      schoolId:      session.schoolId,
      eventType:     body.event_type,
      effectiveDate: body.effective_date,
      endDate:       body.end_date ?? null,
      contractType,
      salaryGrade:   body.salary_grade ?? null,
      positionId:    body.position_id ?? null,
      departmentId:  body.department_id ?? null,
      reason:        body.reason ?? null,
      notes:         body.notes ?? null,
      recordedBy:    session.userId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode ?? 500;
    const message = e instanceof Error ? e.message : 'Failed to record event';
    return NextResponse.json({ error: message }, { status });
  }
}
