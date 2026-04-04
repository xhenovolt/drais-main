/**
 * POST /api/students/migrate
 *
 * School Onboarding Migration Engine — bulk-import 100–5 000 learners
 * from a structured JSON payload with Server-Sent Events progress streaming.
 *
 * ── Request ──────────────────────────────────────────────────────────────────
 * Content-Type: application/json
 * Body: {
 *   learners: Array<{
 *     name?:            string          // "John Doe" (split on first space)
 *     first_name?:      string
 *     last_name?:       string
 *     reg_no?:          string          // admission_no — used for dedup
 *     class:            string          // class name (auto-created if missing)
 *     section?:         string          // stream name
 *     gender?:          'male'|'female'|'other'
 *     date_of_birth?:   string          // ISO 8601 or any parseable date
 *     phone?:           string
 *     address?:         string
 *     photo_url?:       string
 *     biometric_id?:    string
 *     enrollment_type?: 'new'|'continuing'|'re-admitted'
 *   }>
 *   options?: {
 *     createMissingClasses?: boolean    // default true
 *     updateExisting?:       boolean    // default true (update people if reg_no matches)
 *     dryRun?:               boolean    // default false — validate only, no DB writes
 *   }
 * }
 *
 * ── SSE Events ───────────────────────────────────────────────────────────────
 * { type: 'started',   total: N }
 * { type: 'progress',  imported: N, total: N, current_name: string }
 * { type: 'complete',  success: N, updated: N, skipped: N, errors: string[], total: N, dryRun: bool }
 * { type: 'error',     message: string }
 */
import { NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

const CHUNK_SIZE = 50;

interface LearnerRecord {
  name?: string;
  first_name?: string;
  last_name?: string;
  reg_no?: string;
  class?: string;
  section?: string;
  gender?: string;
  date_of_birth?: string;
  phone?: string;
  address?: string;
  photo_url?: string;
  biometric_id?: string;
  enrollment_type?: string;
}

interface MigrateOptions {
  createMissingClasses?: boolean;
  updateExisting?: boolean;
  dryRun?: boolean;
}

function safe(v: unknown): string | null {
  return (v == null || v === '') ? null : String(v).trim() || null;
}

function splitName(record: LearnerRecord): { firstName: string; lastName: string } {
  if (record.first_name || record.last_name) {
    return {
      firstName: String(record.first_name ?? '').trim(),
      lastName:  String(record.last_name  ?? '').trim(),
    };
  }
  if (record.name) {
    const parts = record.name.trim().split(/\s+/);
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || parts[0] || '' };
  }
  return { firstName: '', lastName: '' };
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const schoolId = session.schoolId;

  let body: { learners?: unknown; options?: MigrateOptions };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(body.learners) || body.learners.length === 0) {
    return new Response(JSON.stringify({ success: false, error: '"learners" must be a non-empty array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const learners = body.learners as LearnerRecord[];
  const options: MigrateOptions = {
    createMissingClasses: body.options?.createMissingClasses ?? true,
    updateExisting:       body.options?.updateExisting       ?? true,
    dryRun:               body.options?.dryRun               ?? false,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* stream closed */ }
      };

      const stats = { success: 0, updated: 0, skipped: 0, errors: [] as string[] };
      let conn: any;

      try {
        conn = await getConnection();

        // ── Pre-load lookup caches ────────────────────────────────────────────
        const [rawClasses] = await conn.execute(
          'SELECT id, name FROM classes WHERE school_id = ?',
          [schoolId]
        ) as any[];
        const [rawStreams] = await conn.execute(
          'SELECT id, name FROM streams WHERE school_id = ? OR school_id IS NULL',
          [schoolId]
        ) as any[];
        const [rawYears] = await conn.execute(
          'SELECT id FROM academic_years WHERE school_id = ? AND status = "active" ORDER BY id DESC LIMIT 1',
          [schoolId]
        ) as any[];
        const [rawTerms] = await conn.execute(
          "SELECT id FROM terms WHERE school_id = ? AND (is_active = 1 OR status = 'active') ORDER BY id DESC LIMIT 1",
          [schoolId]
        ) as any[];

        const classMap  = new Map<string, number>(
          (rawClasses as any[]).map((c: any) => [c.name.toLowerCase().trim(), c.id])
        );
        const streamMap = new Map<string, number>(
          (rawStreams as any[]).map((s: any) => [s.name.toLowerCase().trim(), s.id])
        );
        const yearId  = (rawYears as any[])[0]?.id  ?? null;
        const termId  = (rawTerms as any[])[0]?.id  ?? null;

        send({ type: 'started', total: learners.length, dryRun: options.dryRun });

        // ── Process in chunks ─────────────────────────────────────────────────
        for (let start = 0; start < learners.length; start += CHUNK_SIZE) {
          const chunk = learners.slice(start, start + CHUNK_SIZE);

          for (let i = 0; i < chunk.length; i++) {
            const globalIdx = start + i;
            const record = chunk[i];

            try {
              const { firstName, lastName } = splitName(record);
              if (!firstName) {
                stats.errors.push(`Record ${globalIdx + 1}: missing name`);
                stats.skipped++;
                send({ type: 'progress', imported: stats.success + stats.updated, total: learners.length, current_name: `Record ${globalIdx + 1} skipped` });
                continue;
              }

              const regNo = safe(record.reg_no);

              if (options.dryRun) {
                // Dry run — just validate, no DB writes
                stats.success++;
                send({ type: 'progress', imported: stats.success + stats.updated, total: learners.length, current_name: `${firstName} ${lastName} (dry-run)` });
                continue;
              }

              await conn.beginTransaction();
              try {
                let studentId: number | null = null;
                let isUpdate = false;

                // ── Dedup by reg_no / admission_no ────────────────────────────
                if (regNo && options.updateExisting) {
                  const [existing] = await conn.execute(
                    'SELECT s.id FROM students s WHERE s.admission_no = ? AND s.school_id = ? LIMIT 1',
                    [regNo, schoolId]
                  ) as any[];
                  if ((existing as any[]).length > 0) {
                    studentId = (existing as any[])[0].id;
                    isUpdate = true;
                    await conn.execute(
                      `UPDATE people SET
                         first_name = ?, last_name = ?,
                         gender         = COALESCE(?, gender),
                         date_of_birth  = COALESCE(?, date_of_birth),
                         phone          = COALESCE(?, phone),
                         address        = COALESCE(?, address),
                         photo_url      = COALESCE(?, photo_url),
                         updated_at     = NOW()
                       WHERE id = (SELECT person_id FROM students WHERE id = ? LIMIT 1)`,
                      [
                        firstName, lastName,
                        safe(record.gender),
                        safe(record.date_of_birth),
                        safe(record.phone),
                        safe(record.address),
                        safe(record.photo_url),
                        studentId,
                      ]
                    );
                  }
                }

                // ── New learner ───────────────────────────────────────────────
                if (!isUpdate) {
                  const year = new Date().getFullYear();
                  const seq = stats.success + stats.updated + stats.skipped + 1;
                  const admNo = regNo ?? `MIG/${String(seq).padStart(5, '0')}/${year}`;

                  const [pr] = await conn.execute(
                    `INSERT INTO people
                       (school_id, first_name, last_name, gender, date_of_birth, phone, address, photo_url)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      schoolId, firstName, lastName,
                      safe(record.gender),
                      safe(record.date_of_birth),
                      safe(record.phone),
                      safe(record.address),
                      safe(record.photo_url),
                    ]
                  ) as any[];
                  const personId = (pr as any).insertId;

                  const [sr] = await conn.execute(
                    `INSERT INTO students (school_id, person_id, admission_no, status, notes)
                     VALUES (?, ?, ?, 'active', ?)`,
                    [
                      schoolId, personId, admNo,
                      `Migrated ${new Date().toISOString()}${record.biometric_id ? `; biometric_id=${record.biometric_id}` : ''}`,
                    ]
                  ) as any[];
                  studentId = (sr as any).insertId;
                }

                // ── Class resolution ──────────────────────────────────────────
                if (studentId && record.class) {
                  const classKey = record.class.trim().toLowerCase();
                  let classId = classMap.get(classKey) ?? null;

                  // Auto-create class if it doesn't exist and option is enabled
                  if (!classId && options.createMissingClasses) {
                    const [cr] = await conn.execute(
                      `INSERT INTO classes (school_id, name, created_at) VALUES (?, ?, NOW())`,
                      [schoolId, record.class.trim()]
                    ) as any[];
                    classId = (cr as any).insertId;
                    classMap.set(classKey, classId);
                  }

                  if (classId) {
                    const streamKey = record.section ? record.section.trim().toLowerCase() : null;
                    const streamId  = streamKey ? (streamMap.get(streamKey) ?? null) : null;
                    const enrollType = safe(record.enrollment_type) ?? 'new';

                    if (isUpdate) {
                      // Update active enrollment if exists
                      await conn.execute(
                        `UPDATE enrollments
                         SET class_id = ?, stream_id = ?, enrollment_type = ?, updated_at = NOW()
                         WHERE student_id = ? AND school_id = ? AND status = 'active'`,
                        [classId, streamId, enrollType, studentId, schoolId]
                      );
                    } else {
                      // Insert enrollment with upsert guard
                      await conn.execute(
                        `INSERT INTO enrollments
                           (school_id, student_id, class_id, stream_id,
                            academic_year_id, term_id, enrollment_type,
                            enrollment_date, enrolled_at, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW(), 'active')
                         ON DUPLICATE KEY UPDATE
                           class_id = VALUES(class_id),
                           stream_id = VALUES(stream_id),
                           updated_at = NOW()`,
                        [schoolId, studentId, classId, streamId, yearId, termId, enrollType]
                      );
                    }
                  }
                }

                await conn.commit();
                if (isUpdate) { stats.updated++; } else { stats.success++; }
                send({
                  type: 'progress',
                  imported: stats.success + stats.updated,
                  total: learners.length,
                  current_name: `${firstName} ${lastName}`,
                });
              } catch (innerErr: any) {
                await conn.rollback();
                throw innerErr;
              }
            } catch (rowErr: any) {
              const errMsg = `Record ${globalIdx + 1}: ${rowErr.message || 'unknown error'}`;
              stats.errors.push(errMsg);
              stats.skipped++;
              send({ type: 'progress', imported: stats.success + stats.updated, total: learners.length, current_name: `Record ${globalIdx + 1} error` });
            }
          }

          // Yield between chunks to avoid blocking event loop
          await new Promise(r => setTimeout(r, 0));
        }

        // ── Audit + notification (non-critical) ───────────────────────────────
        if (!options.dryRun) {
          logAudit({
            schoolId,
            userId: session.userId,
            action: AuditAction.ENROLLED_STUDENT,
            entityType: 'students',
            details: {
              type: 'migration',
              total: learners.length,
              success: stats.success,
              updated: stats.updated,
              skipped: stats.skipped,
            },
            ip: req.headers.get('x-forwarded-for') || null,
          }).catch(() => { /* non-critical */ });

          conn.execute(
            `INSERT IGNORE INTO notifications
               (school_id, action, entity_type, title, message, priority, channel, created_at)
             VALUES (?, 'MIGRATION_COMPLETE', 'students', 'Migration Complete', ?, 'normal', 'in_app', NOW())`,
            [schoolId, `Migrated ${stats.success} new, updated ${stats.updated}, skipped ${stats.skipped} learners`]
          ).catch(() => { /* non-critical */ });
        }

        send({
          type: 'complete',
          success: stats.success,
          updated: stats.updated,
          skipped: stats.skipped,
          errors:  stats.errors.slice(0, 50),
          total:   learners.length,
          dryRun:  options.dryRun,
          message: options.dryRun
            ? `Dry run validated ${learners.length} records — ${stats.errors.length} issues found`
            : `Migration complete: ${stats.success} added, ${stats.updated} updated, ${stats.skipped} skipped`,
        });
      } catch (err: any) {
        console.error('[migrate] fatal error:', err);
        send({ type: 'error', message: err.message || 'Migration failed unexpectedly' });
      } finally {
        if (conn) { try { await conn.end(); } catch { /* ignore */ } }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream; charset=utf-8',
      'Cache-Control':   'no-cache, no-transform',
      'Connection':      'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
