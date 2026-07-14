import { NextRequest } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEventBus } from '@/lib/events/eventbus';
import { AttendanceFormatter } from '@/lib/attendance/export/AttendanceFormatter';
import { AttendancePresentationModel } from '@/lib/attendance/export/AttendancePresentationModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/stream — live attendance SSE.
 *
 * LATENCY FIX (was ~3-5s): the old version polled zk_attendance_logs
 * every 3000ms (and setInterval doesn't fire until after the first 3s),
 * so a punch waited up to 3s + a heavy 7-table join + TiDB latency.
 *
 * Now: we SUBSCRIBE to the in-process event bus. zk-handler publishes
 * `attendance.event.recorded` the instant a punch is saved; this stream
 * pushes it to the browser immediately (one indexed by-id enrichment
 * query). A slow 10s poll remains ONLY as a safety net for missed/
 * cross-instance events, and runs once immediately on connect to show
 * very recent scans. On a single-instance / offline deployment the bus
 * gives sub-second delivery; on multi-instance cloud the 10s poll
 * backstops anything that landed on another instance.
 *
 * Also SCHOOL-SCOPED now — the old query had no school_id filter, so a
 * scan from school A could appear in school B's session (multi-tenant
 * leak). Fixed.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return new Response('Unauthorized', { status: 401 });
  const schoolId = session.schoolId;
  const formatter = await AttendanceFormatter.forSchool(schoolId);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      let lastId = 0;
      const pushed = new Set<number>(); // dedup across bus + poll
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
        catch { closed = true; }
      };

      // One lightweight, school-scoped enrichment query by scan id range.
      // Reused by the bus push (sinceId = scanId-1) and the safety poll.
      const fetchAndSend = async (sinceId: number): Promise<void> => {
        const rows = (await query(
          `SELECT al.id, al.device_sn, al.device_user_id, al.student_id, al.staff_id,
                  al.check_time, al.verify_type, al.io_mode,
                  re.derived_event, re.derived_detail,
                  al.matched,
                  sp.first_name AS student_first_name, sp.last_name AS student_last_name,
                  sp.photo_url AS student_photo, cl.name AS class_name,
                  stf.first_name AS staff_first_name, stf.last_name AS staff_last_name,
                  dud.device_name AS device_known_name, d.device_name,
                  ob.status AS sms_status
             FROM zk_attendance_logs al
             LEFT JOIN attendance_raw_events re
               ON re.legacy_table = 'zk_attendance_logs' AND re.legacy_id = al.id
             LEFT JOIN devices d   ON al.device_sn = d.sn
             LEFT JOIN students st ON al.student_id = st.id
             LEFT JOIN people sp   ON st.person_id = sp.id
             LEFT JOIN enrollments en ON en.student_id = st.id AND en.status = 'active'
             LEFT JOIN classes cl  ON en.class_id = cl.id
             LEFT JOIN staff stf   ON al.staff_id = stf.id
             LEFT JOIN device_user_directory dud
               ON dud.school_id = al.school_id AND dud.device_sn = al.device_sn
              AND dud.device_user_id = al.device_user_id
             LEFT JOIN notification_outbox ob
               ON ob.school_id = al.school_id
              AND ob.subject_person_id = COALESCE(st.person_id, stf.person_id)
              AND DATE(ob.created_at) = DATE(al.check_time)
             WHERE al.id > ? AND al.school_id = ?
             ORDER BY al.id ASC
             LIMIT 30`,
          [sinceId, schoolId],
        )) as any[];

        for (const r of rows) {
          if (pushed.has(r.id)) { lastId = Math.max(lastId, r.id); continue; }
          pushed.add(r.id);
          if (pushed.size > 500) pushed.clear(); // bound memory
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
          const presentation = AttendancePresentationModel.fromHistoryRow({
            id: r.id,
            device_sn: r.device_sn,
            device_user_id: r.device_user_id,
            check_time: r.check_time,
            verify_type: r.verify_type,
            matched: r.matched,
            role_type: personType,
            derived_event: r.derived_event ?? null,
            derived_detail: r.derived_detail ?? null,
            class_name: r.class_name ?? null,
            person_name: personName,
          }, formatter);
          send({
            id: r.id,
            device_user_id: r.device_user_id,
            check_time: r.check_time,
            person_name: personName,
            person_type: personType,
            class_name: r.class_name,
            matched: Boolean(r.matched),
            verify_type: r.verify_type,
            io_mode: r.io_mode,
            derived_event: r.derived_event ?? null,
            derived_detail: r.derived_detail ?? null,
            device_name: r.device_name,
            device_known_name: r.device_known_name || null,
            photo_url: r.student_photo || null,
            sms_status: r.sms_status ?? null,
            presentation,
          });
          lastId = Math.max(lastId, r.id);
        }
      };

      // Starting high-water mark = newest existing scan (don't replay history).
      try {
        const latest = await query('SELECT MAX(id) AS max_id FROM zk_attendance_logs WHERE school_id = ?', [schoolId]);
        lastId = Number(latest[0]?.max_id || 0);
      } catch { /* start from 0 */ }

      // ── Instant push via the in-process event bus ────────────────────
      const bus = getEventBus();
      const unsubscribe = bus.subscribe('attendance.event.recorded', (ev) => {
        if (closed || ev.schoolId !== schoolId) return;
        // Enrich + push just this scan immediately. The engine's
        // evaluatePunch runs in parallel; derived_event may be NULL for
        // ~1s — the row still shows, and the next safety poll re-pushes
        // nothing (deduped) but the logs page reflects the final state.
        fetchAndSend(ev.scanId - 1).catch(err => console.warn('[SSE bus push]', err));
      });

      // ── Safety-net poll (slow): catches missed / cross-instance events.
      const poll = async () => {
        if (closed) return;
        try { await fetchAndSend(lastId); } catch (err) { console.error('[SSE poll]', err); }
        if (!closed) { try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { closed = true; } }
      };
      const interval = setInterval(poll, 10000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try { unsubscribe(); } catch { /* ignore */ }
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
