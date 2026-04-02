import { NextRequest } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { getLearnerDeepInfo, type LearnerDeepInfo } from '@/lib/getLearnerDeepInfo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/live-scan
 *
 * SSE endpoint for the Identity Pop-up feature.
 * Polls zk_attendance_logs every 2s for new scans, enriches with deep
 * learner info (photo, class, fee balance, guardian), and pushes to clients.
 *
 * Events emitted:
 *   data: { scan_id, device_user_id, check_time, verify_type, io_mode,
 *           matched, person_type, device_name,
 *           learner: LearnerDeepInfo | null,
 *           staff: { first_name, last_name } | null }
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
      controller.enqueue(encoder.encode(': connected\n\n'));

      let lastId = 0;

      // Start from latest ID
      try {
        const latest = await query('SELECT MAX(id) AS max_id FROM zk_attendance_logs');
        lastId = Number((latest as any[])[0]?.max_id || 0);
      } catch {
        // Start from 0
      }

      const poll = async () => {
        if (closed) return;

        try {
          // Lightweight poll — just new scans since last cursor
          const rows = await query(
            `SELECT
               al.id,
               al.device_user_id,
               al.check_time,
               al.verify_type,
               al.io_mode,
               al.matched,
               al.student_id,
               al.staff_id,
               al.device_sn,
               d.device_name,
               stf.first_name AS staff_first_name,
               stf.last_name AS staff_last_name
             FROM zk_attendance_logs al
             LEFT JOIN devices d ON al.device_sn = d.sn
             LEFT JOIN staff stf ON al.staff_id = stf.id
             WHERE al.id > ?
             ORDER BY al.id ASC
             LIMIT 5`,
            [lastId],
          );

          if (rows && (rows as any[]).length > 0) {
            for (const r of rows as any[]) {
              // Determine person type
              let personType = 'unmatched';
              let learner: LearnerDeepInfo | null = null;
              let staff: { first_name: string; last_name: string } | null = null;

              if (r.student_id) {
                personType = 'student';
                try {
                  learner = await getLearnerDeepInfo(r.student_id);
                } catch (err) {
                  console.error('[LiveScan] Deep info fetch failed:', err);
                }
              } else if (r.staff_id) {
                personType = 'staff';
                if (r.staff_first_name || r.staff_last_name) {
                  staff = {
                    first_name: r.staff_first_name || '',
                    last_name: r.staff_last_name || '',
                  };
                }
              }

              const event = {
                scan_id: r.id,
                device_user_id: r.device_user_id,
                check_time: r.check_time,
                verify_type: r.verify_type,
                io_mode: r.io_mode,
                matched: Boolean(r.matched),
                person_type: personType,
                device_name: r.device_name,
                learner,
                staff,
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
              lastId = r.id;
            }
          }
        } catch (err) {
          console.error('[LiveScan] Poll error:', err);
        }

        // Keepalive
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            closed = true;
          }
        }
      };

      // Poll every 2 seconds (faster than the general stream)
      const interval = setInterval(poll, 2000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
