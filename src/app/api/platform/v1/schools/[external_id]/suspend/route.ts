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

  return runMutation(req, ctx, async ({ json }) => {
    const rows = (await query(
      `SELECT id, name, status FROM schools WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
      [external_id],
    )) as any[];
    if (!rows.length) {
      return { status: 404, body: { code: 'NOT_FOUND', message: 'School not found' }, errorCode: 'NOT_FOUND' };
    }
    const s = rows[0];
    if (s.status === 'suspended') {
      return { status: 200, body: { external_id, status: 'suspended', already: true }, schoolId: s.id };
    }
    const reason = json?.reason ?? null;
    // Conditional UPDATE is the synchronization point: under N concurrent
    // calls only the first sees affectedRows=1 and emits the event. Others
    // silently observe the already-suspended state.
    const res: any = await query(
      `UPDATE schools SET status = 'suspended', updated_at = NOW()
        WHERE id = ? AND status <> 'suspended'`,
      [s.id],
    );
    if (!res?.affectedRows) {
      return { status: 200, body: { external_id, status: 'suspended', already: true }, schoolId: s.id };
    }
    await emitPlatformEvent({
      eventType: 'school.suspended',
      schoolId:  s.id,
      payload:   { external_id, name: s.name, previous_status: s.status, reason, by: { consumer: ctx.consumer, keyId: ctx.keyId } },
    });
    return { status: 200, body: { external_id, status: 'suspended' }, schoolId: s.id };
  });
}
