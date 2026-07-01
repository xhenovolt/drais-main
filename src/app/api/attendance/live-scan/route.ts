import { NextRequest } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { getLearnerDeepInfo, type LearnerDeepInfo } from '@/lib/getLearnerDeepInfo';
import { fuzzyCandidates } from '@/lib/biometric/name-fuzzy';
import { resolveIdentity } from '@/lib/biometric/identity/resolve';
import { getEventBus, type AttendanceEventRecordedEvent } from '@/lib/events/eventbus';
import { getCommSettings } from '@/lib/comm/settings';

// ── SMS readiness (cached 60s/school) so the popup can show a definitive
// "SMS disabled" instead of silence when the provider isn't configured or
// no active attendance SMS policy exists. ─────────────────────────────────
const _smsReady = new Map<number, { v: { configured: boolean; hasAttendancePolicy: boolean }; exp: number }>();
async function smsReadiness(schoolId: number): Promise<{ configured: boolean; hasAttendancePolicy: boolean }> {
  const c = _smsReady.get(schoolId);
  if (c && c.exp > Date.now()) return c.v;
  let configured = !!(process.env.AFRICASTALKING_API_KEY || process.env.AT_API_KEY);
  let hasAttendancePolicy = false;
  try {
    const s = await getCommSettings(schoolId);
    if (s.providerUsername && s.providerApiKey) configured = true;
  } catch { /* env fallback */ }
  try {
    const pol = await query(
      `SELECT 1 FROM notification_policies
        WHERE school_id = ? AND event_type = 'attendance.record.upserted'
          AND channel = 'sms' AND is_active = 1 LIMIT 1`,
      [schoolId],
    );
    hasAttendancePolicy = Array.isArray(pol) && (pol as any[]).length > 0;
  } catch { /* table optional */ }
  const v = { configured, hasAttendancePolicy };
  _smsReady.set(schoolId, { v, exp: Date.now() + 60_000 });
  return v;
}

/** A fuzzy-match score this confident is treated as a "likely match"
 *  for the operator — we surface the suspected learner's rich card
 *  (class, fees, boarding/day) but tag it clearly so they still
 *  confirm via the orphan-claim flow. Two strong tokens overlapping
 *  out of three usually scores >= 0.5. */
const TENTATIVE_SCORE_THRESHOLD = 0.5;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/live-scan
 *
 * SSE endpoint for the Identity Pop-up feature.
 *
 * Phase 7 delivery model
 * ----------------------
 *  1. Subscribes to the in-process event bus on stream-open. When
 *     zk-handler publishes attendance.event.recorded for the
 *     listener's school, we enrich + emit the same SSE event in
 *     sub-second time.
 *
 *  2. Poll fallback every 2s as a safety net for:
 *       - missed events (subscriber not yet registered at boot)
 *       - cross-process punches when the Redis Streams adapter
 *         (Phase 7.5) replaces the in-process bus
 *
 *  Dedup: a seenScanIds Set ensures the poll and bus paths never
 *  emit the same row twice. The poll's lastId cursor still advances
 *  so the safety net stays bounded.
 *
 * Events emitted (unchanged from BIO-8):
 *   data: { scan_id, device_user_id, check_time, verify_type, io_mode,
 *           matched, person_type, device_name, device_known_name,
 *           learner, staff, tentative_* }
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
      // Phase 7 — shared dedup set between poll and bus paths. Cap
      // at 200 entries; oldest evicted FIFO. A scan can be safely
      // dropped from the set once it's at least one poll cycle past
      // because the lastId cursor will not pick it up again.
      const seenScanIds = new Set<number>();
      const recentScanQueue: number[] = [];
      const markSeen = (id: number) => {
        if (seenScanIds.has(id)) return false;
        seenScanIds.add(id);
        recentScanQueue.push(id);
        if (recentScanQueue.length > 200) {
          const evict = recentScanQueue.shift();
          if (evict !== undefined) seenScanIds.delete(evict);
        }
        return true;
      };

      // Start from latest ID so the listener doesn't replay history.
      try {
        const latest = await query('SELECT MAX(id) AS max_id FROM zk_attendance_logs');
        lastId = Number((latest as any[])[0]?.max_id || 0);
      } catch {
        // Start from 0
      }

      const safeEnqueue = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // ── Bus subscription (Phase 7 fast path) ────────────────────
      // Listener receives every attendance.event.recorded event for
      // every school. Filter by session.schoolId before spending an
      // enrichment query.
      const bus = getEventBus();
      const unsubscribe = bus.subscribe('attendance.event.recorded', async (event: AttendanceEventRecordedEvent) => {
        if (closed) return;
        if (event.schoolId !== session.schoolId) return;
        if (!markSeen(event.scanId)) return;
        try {
          const row = await fetchScanRow(event.scanId);
          if (!row) return;
          const out = await enrichScanRow(row, session.schoolId);
          safeEnqueue(out);
          if (row.id > lastId) lastId = row.id;
        } catch (err) {
          console.error('[LiveScan] Bus enrichment failed:', err);
        }
      });

      // ── Poll fallback (2s safety net) ──────────────────────────
      const poll = async () => {
        if (closed) return;
        try {
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
               d.passout_enabled,
               d.device_type,
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
              if (!markSeen(r.id)) {
                // The bus already pushed this scan; just advance the cursor.
                if (r.id > lastId) lastId = r.id;
                continue;
              }
              const out = await enrichScanRow(r, session.schoolId);
              safeEnqueue(out);
              if (r.id > lastId) lastId = r.id;
            }
          }
        } catch (err) {
          console.error('[LiveScan] Poll error:', err);
        }

        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            closed = true;
          }
        }
      };

      const interval = setInterval(poll, 2000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try { unsubscribe(); } catch { /* already unsubscribed */ }
        try { controller.close(); } catch { /* already closed */ }
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

// ── Helpers shared by poll + bus paths ────────────────────────────────

interface ScanRow {
  id: number;
  device_user_id: string;
  check_time: string;
  verify_type: number | null;
  io_mode: number | null;
  matched: number;
  student_id: number | null;
  staff_id: number | null;
  device_sn: string;
  device_name: string | null;
  passout_enabled: number | null;
  device_type: string | null;
  staff_first_name: string | null;
  staff_last_name: string | null;
}

async function fetchScanRow(scanId: number): Promise<ScanRow | null> {
  const rows = await query(
    `SELECT
       al.id, al.device_user_id, al.check_time, al.verify_type, al.io_mode,
       al.matched, al.student_id, al.staff_id, al.device_sn,
       d.device_name, d.passout_enabled, d.device_type,
       stf.first_name AS staff_first_name,
       stf.last_name  AS staff_last_name
     FROM zk_attendance_logs al
     LEFT JOIN devices d   ON al.device_sn = d.sn
     LEFT JOIN staff   stf ON al.staff_id  = stf.id
     WHERE al.id = ?
     LIMIT 1`,
    [scanId],
  );
  return (rows as ScanRow[])[0] ?? null;
}

async function enrichScanRow(r: ScanRow, schoolId: number): Promise<Record<string, unknown>> {
  let personType: string = 'unmatched';
  let learner: LearnerDeepInfo | null = null;
  let staff: { first_name: string; last_name: string } | null = null;
  let studentId = r.student_id;
  let staffId = r.staff_id;
  let matched = Boolean(r.matched);

  // Live re-resolve via the unified Phase-1 resolver (same as the
  // ingest path, so the two never disagree).
  if (!studentId && !staffId) {
    try {
      const res = await resolveIdentity(
        { schoolId, deviceSn: r.device_sn, deviceUserId: String(r.device_user_id) },
        { legacyFallback: true },
      );
      if (res.resolved) {
        studentId = res.studentId;
        staffId   = res.staffId;
      }
    } catch { /* keep punch unresolved */ }

    if (studentId || staffId) {
      matched = true;
      query(
        `UPDATE zk_attendance_logs SET student_id = ?, staff_id = ?, matched = 1 WHERE id = ?`,
        [studentId || null, staffId || null, r.id],
      ).catch(() => {});
    }
  }

  // Kick off the heavy deep-info read CONCURRENTLY with the derived/SMS
  // lookups below instead of awaiting it inline — TiDB round-trips are
  // ~200ms each, so serializing them was the popup-latency hot spot.
  let deepInfoPromise: Promise<LearnerDeepInfo | null> | null = null;
  if (studentId) {
    personType = 'student';
    deepInfoPromise = getLearnerDeepInfo(studentId).catch((err) => {
      console.error('[LiveScan] Deep info fetch failed:', err);
      return null;
    });
  } else if (staffId) {
    personType = 'staff';
    if (r.staff_first_name || r.staff_last_name) {
      staff = {
        first_name: r.staff_first_name || '',
        last_name: r.staff_last_name || '',
      };
    }
  }

  // BIO-8: device-known name for unmatched scans.
  let deviceKnownName: string | null = null;
  let tentativeLearner: LearnerDeepInfo | null = null;
  let tentativeScore: number | null = null;
  let tentativeStaffName: string | null = null;
  if (!matched) {
    try {
      const dud = await query(
        `SELECT device_name FROM device_user_directory
          WHERE device_sn = ? AND device_user_id = ? LIMIT 1`,
        [r.device_sn, r.device_user_id],
      );
      if (Array.isArray(dud) && (dud as any[]).length > 0) {
        deviceKnownName = (dud as any[])[0].device_name || null;
      }
    } catch { /* table not present yet */ }

    if (deviceKnownName) {
      try {
        const cands = await fuzzyCandidates(deviceKnownName, schoolId);
        const top = cands[0];
        if (top && top.score >= TENTATIVE_SCORE_THRESHOLD) {
          if (top.type === 'student') {
            tentativeLearner = await getLearnerDeepInfo(top.id);
            tentativeScore = top.score;
          } else {
            tentativeStaffName = top.name;
            tentativeScore = top.score;
          }
        }
      } catch (err) {
        console.error('[LiveScan] Tentative fuzzy match failed:', err);
      }
    }
  }

  // DERIVED attendance meaning (state engine) + SMS notification state.
  // Both lightweight, both optional — never block the popup if missing.
  // raw_events lookup and the person_id lookup are independent, so we run
  // them CONCURRENTLY (and alongside the deep-info read above).
  let derivedEvent: string | null = null;
  let derivedDetail: string | null = null;
  let smsStatus: string | null = null;

  const [reRows, personId] = await Promise.all([
    query(
      `SELECT derived_event, derived_detail FROM attendance_raw_events
        WHERE legacy_table = 'zk_attendance_logs' AND legacy_id = ? LIMIT 1`,
      [r.id],
    ).catch(() => [] as any[]),
    studentId
      ? query('SELECT person_id FROM students WHERE id = ? LIMIT 1', [studentId]).then((x: any) => x[0]?.person_id ?? null).catch(() => null)
      : staffId
        ? query('SELECT person_id FROM staff WHERE id = ? LIMIT 1', [staffId]).then((x: any) => x[0]?.person_id ?? null).catch(() => null)
        : Promise.resolve(null),
  ]);

  if (Array.isArray(reRows) && (reRows as any[])[0]) {
    derivedEvent = (reRows as any[])[0].derived_event ?? null;
    derivedDetail = (reRows as any[])[0].derived_detail ?? null;
  }
  // SMS state: did attendance fanout produce/queue an outbox row for
  // this person today? (queued|sending|delivered|failed) → else null.
  if (personId) {
    try {
      const ob = await query(
        `SELECT status FROM notification_outbox
          WHERE school_id = ? AND subject_person_id = ? AND DATE(created_at) = CURDATE()
          ORDER BY id DESC LIMIT 1`,
        [schoolId, personId],
      );
      if (Array.isArray(ob) && (ob as any[])[0]) smsStatus = (ob as any[])[0].status;
    } catch { /* outbox optional */ }
  }

  // If no outbox row exists yet, still give the operator a DEFINITIVE SMS
  // state instead of silence: 'disabled' (SMS off / not configured / no
  // attendance policy), 'no_phone' (guardian phone missing), or 'pending'.
  if (!smsStatus && matched && (studentId || staffId)) {
    try {
      const ready = await smsReadiness(schoolId);
      if (!ready.configured || !ready.hasAttendancePolicy) {
        smsStatus = 'disabled';
      } else if (studentId) {
        // Configured + policy active: the only reason no SMS would go out is
        // a missing guardian phone — surface that explicitly.
        const g = await query(
          `SELECT 1 FROM students s
             JOIN student_contacts sc ON sc.student_id = s.id
             JOIN contacts con ON con.id = sc.contact_id
             JOIN people cp ON cp.id = con.person_id
            WHERE s.id = ? AND cp.phone IS NOT NULL AND cp.phone <> '' LIMIT 1`,
          [studentId],
        );
        smsStatus = (Array.isArray(g) && (g as any[]).length > 0) ? 'pending' : 'no_phone';
      }
    } catch { /* leave null */ }
  }

  // Settle the concurrent deep-info read started above.
  if (deepInfoPromise) {
    learner = await deepInfoPromise;
  }

  // Pass-out gate decision — ONLY on gate-tagged devices (in-memory check from
  // the device JOIN, no extra round-trip on normal attendance scans). Additive
  // and fully guarded: it can never break or block a normal attendance popup.
  let passout: Record<string, unknown> | null = null;
  const isGate = Number(r.passout_enabled) === 1 || r.device_type === 'gate';
  if (studentId && isGate) {
    try {
      const { decideGate, applyGate } = await import('@/lib/passouts/engine');
      passout = await decideGate(schoolId, studentId) as unknown as Record<string, unknown>;
      // Record the exit/return in the background — never block the popup on it.
      applyGate(schoolId, studentId, r.device_sn, r.id, null).catch(() => {});
    } catch { /* pass-out module optional — leave attendance popup unaffected */ }
  }

  return {
    scan_id: r.id,
    passout,
    device_user_id: r.device_user_id,
    check_time: r.check_time,
    verify_type: r.verify_type,
    io_mode: r.io_mode,
    derived_event: derivedEvent,
    derived_detail: derivedDetail,
    sms_status: smsStatus,
    matched,
    person_type: personType,
    device_name: r.device_name,
    device_known_name: deviceKnownName,
    tentative_learner: tentativeLearner,
    tentative_staff_name: tentativeStaffName,
    tentative_score: tentativeScore,
    learner,
    staff,
  };
}
