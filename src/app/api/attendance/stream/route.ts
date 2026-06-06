import { NextRequest } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/stream
 *
 * Server-Sent Events (SSE) endpoint for live attendance feed with status tracking.
 * Polls attendance_raw_events every 3s for new rows since last seen ID,
 * enriches with person names and status info, and pushes to connected clients.
 *
 * The client connects with:
 *   const es = new EventSource('/api/attendance/stream');
 *   es.onmessage = (e) => { const data = JSON.parse(e.data); ... };
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial keepalive
      controller.enqueue(encoder.encode(': connected\n\n'));

      let lastId = 0;

      // Get starting point: latest raw event ID
      try {
        const latest = await query('SELECT MAX(id) AS max_id FROM attendance_raw_events WHERE school_id = ?', [session.schoolId]);
        lastId = Number(latest[0]?.max_id || 0);
      } catch {
        // Start from 0 if table is empty
      }

      const poll = async () => {
        if (closed) return;

        try {
          const rows = await query(
            `SELECT
                are.id,
                are.device_user_id,
                are.punch_at,
                are.status,
                are.error_code,
                are.error_message,
                are.processed_at,
                are.person_id,
                are.role_type,
                zal.id AS legacy_id,
                zal.student_id,
                zal.staff_id,
                zal.device_sn,
                zal.verify_type,
                zal.io_mode,
                zal.matched,
                sp.first_name  AS student_first_name,
                sp.last_name   AS student_last_name,
                sp.photo_url   AS student_photo,
                cl.name        AS class_name,
                stf.first_name AS staff_first_name,
                stf.last_name  AS staff_last_name,
                dud.device_name AS device_known_name,
                d.device_name
              FROM attendance_raw_events are
              LEFT JOIN zk_attendance_logs zal ON are.legacy_table = 'zk_attendance_logs' AND are.legacy_id = zal.id
              LEFT JOIN devices d ON zal.device_sn = d.sn
              LEFT JOIN students st ON zal.student_id = st.id
              LEFT JOIN people sp ON st.person_id = sp.id
              LEFT JOIN classes cl ON st.class_id = cl.id
              LEFT JOIN staff stf ON zal.staff_id = stf.id
              LEFT JOIN device_user_directory dud
                ON dud.school_id = are.school_id
               AND dud.device_sn = zal.device_sn
               AND dud.device_user_id = are.device_user_id
              WHERE are.school_id = ? AND are.id > ?
              ORDER BY are.id ASC
              LIMIT 20`,
            [session.schoolId, lastId],
          );

          if (rows && (rows as any[]).length > 0) {
            for (const r of rows as any[]) {
              let personName: string | null = null;
              let personType = 'unmatched';

              if (r.student_id && (r.student_first_name || r.student_last_name)) {
                personName = [r.student_first_name, r.student_last_name].filter(Boolean).join(' ');
                personType = 'student';
              } else if (r.staff_id && (r.staff_first_name || r.staff_last_name)) {
                personName = [r.staff_first_name, r.staff_last_name].filter(Boolean).join(' ');
                personType = 'staff';
              } else if (r.device_known_name) {
                personName = r.device_known_name;
              }

              const event = {
                id: r.id,
                device_user_id: r.device_user_id,
                check_time: r.punch_at,
                person_name: personName,
                person_type: personType,
                class_name: r.class_name,
                matched: Boolean(r.matched),
                verify_type: r.verify_type,
                io_mode: r.io_mode,
                device_name: r.device_name,
                device_known_name: r.device_known_name || null,
                photo_url: r.student_photo || null,
                status: r.status || 'pending',
                error_code: r.error_code || null,
                error_message: r.error_message || null,
                processed_at: r.processed_at || null,
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
              lastId = r.id;
            }
          }
        } catch (err) {
          // Don't crash the stream — log and continue
          console.error('[SSE Stream] Poll error:', err);
        }

        // Keepalive every cycle
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            closed = true;
          }
        }
      };

      // Poll every 3 seconds
      const interval = setInterval(poll, 3000);

      // Cleanup on abort
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
