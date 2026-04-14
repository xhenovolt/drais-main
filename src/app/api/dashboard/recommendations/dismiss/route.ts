import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// POST /api/dashboard/recommendations/dismiss
// Body: { rec_id: string, action: 'acted' | 'dismissed' | 'snoozed', rec_type: string }
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { rec_id?: string; action?: string; rec_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { rec_id, action, rec_type } = body;

  if (!rec_id || !action || !rec_type) {
    return NextResponse.json({ error: 'rec_id, action, and rec_type are required' }, { status: 400 });
  }
  const allowed = ['acted', 'dismissed', 'snoozed'];
  if (!allowed.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${allowed.join(', ')}` }, { status: 400 });
  }

  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `INSERT INTO recommendation_actions (school_id, rec_type, rec_key, action_taken, user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE action_taken = VALUES(action_taken), created_at = NOW()`,
      [session.schoolId, rec_type, rec_id, action, (session as any).userId ?? null],
    );
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // If table doesn't exist yet, silently succeed — migration may not have run
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("doesn't exist") || msg.includes('Table') || msg.includes('1146')) {
      return NextResponse.json({ success: true });
    }
    console.error('[recommendations/dismiss] Error:', msg);
    return NextResponse.json({ error: 'Failed to record action' }, { status: 500 });
  } finally {
    if (conn && typeof (conn as any).release === 'function') {
      (conn as any).release();
    }
  }
}
