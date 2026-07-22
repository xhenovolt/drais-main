/**
 * Phase 2 — acquisition inspection API
 * (docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md §7-§9).
 *
 *   GET  /api/attendance/acquisitions            → batch list (audit trail)
 *   GET  /api/attendance/acquisitions?id=<id>    → batch + verbatim staged
 *        records for the Raw Inspection screen. device_wall_time is served
 *        EXACTLY as received from the device — no formatting, no timezone
 *        conversion (mission Phase 2 requirement).
 *   POST /api/attendance/acquisitions { id, action:'discard' }
 *        → operator rejects the batch; staging kept for audit, status
 *        transition guarded (only staged/validated may be discarded).
 *
 * NO writes to attendance_raw_events from this route, ever.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  listAcquisitions, getAcquisitionRecords,
} from '@/lib/attendance/acquisition/service';
import { commitAcquisition } from '@/lib/attendance/acquisition/commit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const idRaw = url.searchParams.get('id');

  if (idRaw) {
    const id = parseInt(idRaw, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const detail = await getAcquisitionRecords(session.schoolId, id);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, ...detail });
  }

  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const batches = await listAcquisitions(session.schoolId, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ success: true, data: batches });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = parseInt(body?.id, 10);
  const action = String(body?.action || '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  if (action === 'discard') {
    const res = (await query(
      `UPDATE attendance_acquisitions
          SET status = 'discarded', completed_at = UTC_TIMESTAMP()
        WHERE id = ? AND school_id = ? AND status IN ('staged', 'validated')`,
      [id, session.schoolId],
    )) as { affectedRows?: number };
    if (!res?.affectedRows) {
      return NextResponse.json({ error: 'Batch not found or not in a discardable state' }, { status: 409 });
    }
    return NextResponse.json({ success: true, id, status: 'discarded' });
  }

  if (action === 'commit') {
    // Phase 4 — the guarded committer. Transactional; wall→UTC exactly
    // once; cross-source dup re-check inside the tx; full provenance.
    try {
      const result = await commitAcquisition({
        schoolId: session.schoolId,
        acquisitionId: id,
        operatorId: session.userId ?? null,
      });
      return NextResponse.json({ success: true, ...result });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'Commit failed' }, { status: 409 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
