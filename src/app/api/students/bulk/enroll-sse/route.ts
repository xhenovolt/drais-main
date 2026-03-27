import { NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * POST /api/students/bulk/enroll-sse
 *
 * Streams real-time enrollment progress via Server-Sent Events (SSE).
 * Accepts a list of enrollment entries and processes them sequentially,
 * emitting a progress event after each student is handled.
 *
 * Request body:
 * {
 *   entries: Array<{
 *     student_id:       number;
 *     class_id:         number;
 *     academic_year_id: number;
 *     term_id:          number;
 *     study_mode_id:    number;
 *     program_ids?:     number[];
 *     stream_id?:       number;
 *     student_name?:    string;  // display-only, not stored
 *     class_name?:      string;  // display-only, not stored
 *   }>
 * }
 *
 * SSE events emitted:
 *   { type: 'start',    total: number }
 *   { type: 'progress', index: number, total: number, student_id: number,
 *     student_name: string, class_name: string, status: 'ok'|'skip'|'error',
 *     message?: string }
 *   { type: 'done',     inserted: number, skipped: number, failed: number,
 *     errors: Array<{ student_id: number; name: string; error: string }> }
 */
export async function POST(req: NextRequest) {
  // ----- Auth -----
  const session = await getSessionSchoolId(req);
  if (!session) {
    return new Response('Not authenticated', { status: 401 });
  }
  const schoolId = session.schoolId;

  // ----- Parse body -----
  let entries: Array<{
    student_id: number;
    class_id: number;
    academic_year_id: number;
    term_id: number;
    study_mode_id: number;
    program_ids?: number[];
    stream_id?: number;
    student_name?: string;
    class_name?: string;
  }>;

  try {
    const body = await req.json();
    if (!Array.isArray(body?.entries) || body.entries.length === 0) {
      return new Response('entries array required', { status: 400 });
    }
    entries = body.entries;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  // ----- SSE stream -----
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let inserted = 0;
      let skipped  = 0;
      let failed   = 0;
      const errors: Array<{ student_id: number; name: string; error: string }> = [];

      // Open one connection shared across all inserts
      const conn = await getConnection();

      try {
        send({ type: 'start', total: entries.length });

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const label = entry.student_name ?? `Student #${entry.student_id}`;

          try {
            // Validate required fields
            if (!entry.student_id || !entry.class_id || !entry.academic_year_id || !entry.term_id) {
              throw new Error('Missing required field (student_id, class_id, academic_year_id, or term_id)');
            }

            // Check student belongs to this school
            const [ownership]: any = await conn.execute(
              'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1',
              [entry.student_id, schoolId]
            );
            if (!Array.isArray(ownership) || ownership.length === 0) {
              throw new Error('Student not found in your school');
            }

            // Check for duplicate enrollment
            const [existing]: any = await conn.execute(
              'SELECT id FROM enrollments WHERE student_id = ? AND academic_year_id = ? AND term_id = ? LIMIT 1',
              [entry.student_id, entry.academic_year_id, entry.term_id]
            );
            if (Array.isArray(existing) && existing.length > 0) {
              skipped++;
              send({
                type:         'progress',
                index:        i + 1,
                total:        entries.length,
                student_id:   entry.student_id,
                student_name: label,
                class_name:   entry.class_name ?? '',
                status:       'skip',
                message:      'Already enrolled in this term',
              });
              continue;
            }

            // Insert enrollment
            const [result]: any = await conn.execute(
              `INSERT INTO enrollments
                 (student_id, class_id, stream_id, academic_year_id, term_id,
                  study_mode_id, status, enrollment_type, joined_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'active', 'promoted', NOW(), NOW(), NOW())`,
              [
                entry.student_id,
                entry.class_id,
                entry.stream_id ?? null,
                entry.academic_year_id,
                entry.term_id,
                entry.study_mode_id || null,
              ]
            );

            const enrollmentId = (result as any).insertId;

            // Link programs
            if (Array.isArray(entry.program_ids) && entry.program_ids.length > 0) {
              const progValues = entry.program_ids.map((pid: number) => [enrollmentId, pid]);
              await conn.query(
                'INSERT IGNORE INTO enrollment_programs (enrollment_id, program_id) VALUES ?',
                [progValues]
              );
            }

            inserted++;
            send({
              type:         'progress',
              index:        i + 1,
              total:        entries.length,
              student_id:   entry.student_id,
              student_name: label,
              class_name:   entry.class_name ?? '',
              status:       'ok',
            });
          } catch (err) {
            failed++;
            const msg = err instanceof Error ? err.message : 'Unknown error';
            errors.push({ student_id: entry.student_id, name: label, error: msg });
            send({
              type:         'progress',
              index:        i + 1,
              total:        entries.length,
              student_id:   entry.student_id,
              student_name: label,
              class_name:   entry.class_name ?? '',
              status:       'error',
              message:      msg,
            });
          }
        }

        send({ type: 'done', inserted, skipped, failed, errors });
      } finally {
        await conn.end();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
