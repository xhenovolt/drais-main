import { NextRequest } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEventBus, type AttendanceEventRecordedEvent } from '@/lib/events/eventbus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/live-identity
 *
 * LIGHTWEIGHT scan stream for the fast popup path.
 *
 * Unlike /live-scan, this endpoint does NO per-scan enrichment — no
 * getLearnerDeepInfo, no resolveIdentity, no fee/guardian/outbox reads.
 * It forwards only the punch IDENTITY (scan id, device user id, resolved
 * student_id / staff_id, check time). A client that already holds the
 * roster in memory (e.g. /students/list) matches student_id locally and
 * renders the popup instantly — zero server round-trips per scan.
 *
 * Delivery:
 *   - Bus fast path: forwards attendance.event.recorded (identity already
 *     attached by the ingest) the instant it fires.
 *   - Poll fallback (2s): SELECTs only the few identity columns for new
 *     rows — cheap and indexed — so the stream still works across
 *     serverless instances where the in-process bus can't reach.
 *
 * Payload: { scan_id, device_user_id, student_id, staff_id, person_type,
 *            matched, check_time }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      const seen = new Set<number>();
      const seenQ: number[] = [];
      const mark = (id: number) => {
        if (seen.has(id)) return false;
        seen.add(id); seenQ.push(id);
        if (seenQ.length > 200) { const e = seenQ.shift(); if (e !== undefined) seen.delete(e); }
        return true;
      };

      let lastId = 0;
      try {
        const r = await query('SELECT MAX(id) AS m FROM zk_attendance_logs WHERE school_id = ?', [session.schoolId]);
        lastId = Number((r as any[])[0]?.m || 0);
      } catch { /* start from 0 */ }

      const send = (p: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(p)}\n\n`)); }
        catch { closed = true; }
      };

      const shape = (r: any) => ({
        scan_id: r.id,
        device_user_id: String(r.device_user_id),
        student_id: r.student_id != null ? String(r.student_id) : null,
        staff_id: r.staff_id != null ? String(r.staff_id) : null,
        person_type: r.student_id ? 'student' : r.staff_id ? 'staff' : 'unmatched',
        matched: Boolean(r.matched) || Boolean(r.student_id) || Boolean(r.staff_id),
        check_time: r.check_time,
        // Cheap display fields (single indexed join) so the popup can render
        // photo/class/gender even if the client roster doesn't hold them.
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        gender: r.gender ?? null,
        photo_url: r.photo_url ?? null,
        class_name: r.class_name ?? null,
      });

      // ── Bus fast path (same-instance, sub-second) ────────────────────
      const bus = getEventBus();
      const unsubscribe = bus.subscribe('attendance.event.recorded', (e: AttendanceEventRecordedEvent) => {
        if (closed || e.schoolId !== session.schoolId) return;
        if (!mark(e.scanId)) return;
        send({
          scan_id: e.scanId,
          device_user_id: e.deviceUserId,
          student_id: e.studentId != null ? String(e.studentId) : null,
          staff_id: e.staffId != null ? String(e.staffId) : null,
          person_type: e.studentId ? 'student' : e.staffId ? 'staff' : 'unmatched',
          matched: e.matched,
          check_time: e.checkTime ?? null,
        });
        if (e.scanId > lastId) lastId = e.scanId;
      });

      // ── Poll fallback (2s, identity columns only) ────────────────────
      const poll = async () => {
        if (closed) return;
        try {
          const rows = await query(
            `SELECT al.id, al.device_user_id, al.student_id, al.staff_id,
                    al.matched, al.check_time,
                    p.first_name, p.last_name, p.gender, p.photo_url,
                    c.name AS class_name
               FROM zk_attendance_logs al
               LEFT JOIN students s    ON al.student_id = s.id
               LEFT JOIN people p      ON s.person_id   = p.id
               LEFT JOIN enrollments e ON e.student_id  = s.id AND e.status = 'active'
               LEFT JOIN classes c     ON e.class_id    = c.id
              WHERE al.id > ? AND al.school_id = ?
              ORDER BY al.id ASC LIMIT 10`,
            [lastId, session.schoolId],
          );
          for (const r of rows as any[]) {
            if (mark(r.id)) send(shape(r));
            if (r.id > lastId) lastId = r.id;
          }
        } catch { /* transient */ }
        if (!closed) { try { controller.enqueue(encoder.encode(': hb\n\n')); } catch { closed = true; } }
      };
      const interval = setInterval(poll, 2000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try { unsubscribe(); } catch { /* noop */ }
        try { controller.close(); } catch { /* noop */ }
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
