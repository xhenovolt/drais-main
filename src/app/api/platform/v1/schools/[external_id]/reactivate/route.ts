import { NextRequest } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform/auth';
import { runMutation } from '@/lib/platform/withMutation';
import { query } from '@/lib/db';
import { emitPlatformEvent } from '@/lib/platform/events';

export async function POST(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['schools:write']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;

  return runMutation(req, ctx, async () => {
    const rows = (await query(
      `SELECT id, name, status FROM schools WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
      [external_id],
    )) as any[];
    if (!rows.length) {
      return { status: 404, body: { code: 'NOT_FOUND', message: 'School not found' }, errorCode: 'NOT_FOUND' };
    }
    const s = rows[0];
    if (s.status === 'active') {
      return { status: 200, body: { external_id, status: 'active', already: true }, schoolId: s.id };
    }
    // Conditional UPDATE: only the first concurrent caller flips the row
    // and emits the event. Subsequent racers see affectedRows=0.
    const res: any = await query(
      `UPDATE schools SET status = 'active', updated_at = NOW()
        WHERE id = ? AND status <> 'active'`,
      [s.id],
    );
    if (!res?.affectedRows) {
      return { status: 200, body: { external_id, status: 'active', already: true }, schoolId: s.id };
    }
    await emitPlatformEvent({
      eventType: 'school.reactivated',
      schoolId:  s.id,
      payload:   { external_id, name: s.name, previous_status: s.status, by: { consumer: ctx.consumer, keyId: ctx.keyId } },
    });
    return { status: 200, body: { external_id, status: 'active' }, schoolId: s.id };
  });
}
