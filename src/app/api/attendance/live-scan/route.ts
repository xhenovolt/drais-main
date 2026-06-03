import { NextRequest } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { getLearnerDeepInfo, type LearnerDeepInfo } from '@/lib/getLearnerDeepInfo';
import { fuzzyCandidates } from '@/lib/biometric/name-fuzzy';

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
              let studentId = r.student_id;
              let staffId = r.staff_id;
              let matched = Boolean(r.matched);

              // ── Live re-resolve: if the log is unmatched, try mapping tables ──
              if (!studentId && !staffId) {
                try {
                  const mapping = await query(
                    `SELECT user_type, student_id, staff_id FROM zk_user_mapping
                     WHERE device_user_id = ? AND (device_sn = ? OR device_sn IS NULL)
                     LIMIT 1`,
                    [r.device_user_id, r.device_sn],
                  );
                  if (mapping && (mapping as any[]).length > 0) {
                    studentId = (mapping as any[])[0].student_id;
                    staffId = (mapping as any[])[0].staff_id;
                  }
                } catch { /* non-critical */ }

                // Fallback: device_user_mappings
                if (!studentId && !staffId) {
                  try {
                    const dum = await query(
                      `SELECT student_id, staff_id FROM device_user_mappings
                       WHERE device_user_id = ? AND device_sn = ? LIMIT 1`,
                      [r.device_user_id, r.device_sn],
                    );
                    if (dum && (dum as any[]).length > 0) {
                      studentId = (dum as any[])[0].student_id;
                      staffId = (dum as any[])[0].staff_id;
                    }
                  } catch { /* non-critical */ }
                }

                // If we found a match, update the log for future reads
                if (studentId || staffId) {
                  matched = true;
                  query(
                    `UPDATE zk_attendance_logs SET student_id = ?, staff_id = ?, matched = 1 WHERE id = ?`,
                    [studentId || null, staffId || null, r.id],
                  ).catch(() => {});
                }
              }

              if (studentId) {
                personType = 'student';
                try {
                  learner = await getLearnerDeepInfo(studentId);
                } catch (err) {
                  console.error('[LiveScan] Deep info fetch failed:', err);
                }
              } else if (staffId) {
                personType = 'staff';
                if (r.staff_first_name || r.staff_last_name) {
                  staff = {
                    first_name: r.staff_first_name || '',
                    last_name: r.staff_last_name || '',
                  };
                }
              }

              // PHASE BIO-8 — when still unmatched, attach the
              // device-known name from device_user_directory. This is
              // what the device thinks it knows about the punching
              // user, captured from earlier USERINFO/OPERLOG records.
              // Lets the popup show "ABUBAKAR SHEKHA ALI" rather than
              // "User ID = 2". Best-effort; tolerates missing table.
              let deviceKnownName: string | null = null;
              let tentativeLearner: LearnerDeepInfo | null = null;
              let tentativeScore: number | null = null;
              let tentativeStaffName: string | null = null;
              if (!matched) {
                try {
                  const dud = await query(
                    `SELECT device_name
                       FROM device_user_directory
                      WHERE device_sn = ? AND device_user_id = ?
                      LIMIT 1`,
                    [r.device_sn, r.device_user_id],
                  );
                  if (Array.isArray(dud) && (dud as any[]).length > 0) {
                    deviceKnownName = (dud as any[])[0].device_name || null;
                  }
                } catch { /* table not yet created or query failed — keep null */ }

                // The whole reason we bother capturing the
                // device-supplied name (BIO-8) is so we can surface
                // the *learner context* — class, balance, boarding/day
                // — for the suspected person while the operator
                // formally claims the orphan PIN. Run the same fuzzy
                // matcher that powers the orphan-claim queue and, if
                // we're confident, hydrate the rich deep-info card.
                if (deviceKnownName) {
                  try {
                    const cands = await fuzzyCandidates(deviceKnownName, session.schoolId);
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

              const event = {
                scan_id: r.id,
                device_user_id: r.device_user_id,
                check_time: r.check_time,
                verify_type: r.verify_type,
                io_mode: r.io_mode,
                matched,
                person_type: personType,
                device_name: r.device_name,
                /** What the device thinks it knows. Useful when matched=false. */
                device_known_name: deviceKnownName,
                /** Best-guess learner the device name resolves to —
                 *  populated only when matched=false AND the fuzzy
                 *  score is high enough to be useful. The popup shows
                 *  this as a "Likely match" card with class, balance,
                 *  and boarding/day, but the operator still has to
                 *  claim the PIN before subsequent scans auto-resolve. */
                tentative_learner: tentativeLearner,
                tentative_staff_name: tentativeStaffName,
                tentative_score: tentativeScore,
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
