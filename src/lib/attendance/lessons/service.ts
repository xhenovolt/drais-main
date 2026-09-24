/**
 * Lesson attendance — DB orchestration around the pure engine.
 *
 * Idempotent by construction: every write is an upsert on a natural unique key
 * (occurrence, person) and every verdict is recomputed from raw evidence, so
 * replayed callbacks, duplicate punches and historical recalculation converge
 * to the same rows. Manual corrections (source='manual') are never overwritten.
 *
 * Separate from school-entry attendance_records and from teacher attendance.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { logAudit } from '@/lib/audit';
import {
  DEFAULT_LESSON_POLICY, MANUAL_STATUSES, assignPunchesToLessons, deriveLessonStatus, isoWeekday, localDateOf,
  localToUtcMs, resolveDevice, sanitizePolicy, summarizeRoster,
  type DeviceInfo, type DeviceScope, type LessonPolicy, type LessonRef, type LessonStatus, type Punch,
} from './engine';

// ── settings ───────────────────────────────────────────────────────────────

const settingsCache = new Map<number, { exp: number; p: LessonPolicy }>();

export async function getLessonPolicy(schoolId: number, fresh = false): Promise<LessonPolicy> {
  const c = settingsCache.get(schoolId);
  if (!fresh && c && c.exp > Date.now()) return c.p;
  let p = DEFAULT_LESSON_POLICY;
  try {
    const rows = (await query(
      `SELECT enabled, checkin_before_minutes, grace_minutes, late_until_minutes, min_presence_minutes,
              absent_finalize_delay_minutes, unmapped_device_scope, auto_roster
         FROM lesson_attendance_settings WHERE school_id = ? LIMIT 1`,
      [schoolId],
    )) as any[];
    if (rows[0]) {
      const r = rows[0];
      p = sanitizePolicy({
        enabled: Number(r.enabled) === 1,
        checkinBeforeMinutes: r.checkin_before_minutes, graceMinutes: r.grace_minutes,
        lateUntilMinutes: r.late_until_minutes, minPresenceMinutes: r.min_presence_minutes,
        absentFinalizeDelayMinutes: r.absent_finalize_delay_minutes,
        unmappedDeviceScope: r.unmapped_device_scope, autoRoster: Number(r.auto_roster) === 1,
      });
    }
  } catch { /* table not migrated yet -> disabled defaults */ }
  settingsCache.set(schoolId, { exp: Date.now() + 30_000, p });
  return p;
}

export async function saveLessonPolicy(schoolId: number, userId: number, patch: Record<string, unknown>): Promise<LessonPolicy> {
  const next = sanitizePolicy(patch, await getLessonPolicy(schoolId, true));
  await query(
    `INSERT INTO lesson_attendance_settings
       (school_id, enabled, checkin_before_minutes, grace_minutes, late_until_minutes, min_presence_minutes,
        absent_finalize_delay_minutes, unmapped_device_scope, auto_roster, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), checkin_before_minutes = VALUES(checkin_before_minutes),
       grace_minutes = VALUES(grace_minutes), late_until_minutes = VALUES(late_until_minutes),
       min_presence_minutes = VALUES(min_presence_minutes), absent_finalize_delay_minutes = VALUES(absent_finalize_delay_minutes),
       unmapped_device_scope = VALUES(unmapped_device_scope), auto_roster = VALUES(auto_roster), updated_by = VALUES(updated_by)`,
    [schoolId, next.enabled ? 1 : 0, next.checkinBeforeMinutes, next.graceMinutes, next.lateUntilMinutes, next.minPresenceMinutes,
      next.absentFinalizeDelayMinutes, next.unmappedDeviceScope, next.autoRoster ? 1 : 0, userId],
  );
  settingsCache.delete(schoolId);
  await logAudit({ schoolId, userId, action: 'LESSON_ATTENDANCE_SETTINGS_CHANGED', entityType: 'lesson_attendance_settings', entityId: schoolId, details: next as any });
  return next;
}

// ── device scopes ──────────────────────────────────────────────────────────

export interface DeviceScopeRow {
  sn: string; deviceName: string | null; location: string | null; roleLabel: string | null;
  scope: DeviceScope | null; classId: number | null; streamId: number | null; room: string | null;
}

export async function listDeviceScopes(schoolId: number): Promise<DeviceScopeRow[]> {
  const rows = (await query(
    `SELECT d.sn, d.device_name, d.location, d.role_label, s.scope, s.class_id, s.stream_id, s.room
       FROM devices d
       LEFT JOIN device_attendance_scopes s ON s.school_id = d.school_id AND s.device_sn = d.sn
      WHERE d.school_id = ? AND d.deleted_at IS NULL
      ORDER BY d.device_name, d.sn`,
    [schoolId],
  )) as any[];
  return rows.map((r) => ({
    sn: r.sn, deviceName: r.device_name, location: r.location, roleLabel: r.role_label,
    scope: r.scope ?? null, classId: r.class_id != null ? Number(r.class_id) : null,
    streamId: r.stream_id != null ? Number(r.stream_id) : null, room: r.room ?? null,
  }));
}

export async function saveDeviceScope(schoolId: number, userId: number, p: {
  deviceSn: string; scope: DeviceScope | null; classId?: number | null; streamId?: number | null; room?: string | null;
}): Promise<boolean> {
  const own = (await query('SELECT 1 FROM devices WHERE sn = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1', [p.deviceSn, schoolId])) as any[];
  if (!own[0]) return false;
  if (p.scope === null) {
    await query('DELETE FROM device_attendance_scopes WHERE school_id = ? AND device_sn = ?', [schoolId, p.deviceSn]);
  } else {
    await query(
      `INSERT INTO device_attendance_scopes (school_id, device_sn, scope, class_id, stream_id, room, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE scope = VALUES(scope), class_id = VALUES(class_id), stream_id = VALUES(stream_id),
         room = VALUES(room), updated_by = VALUES(updated_by)`,
      [schoolId, p.deviceSn, p.scope, p.classId ?? null, p.streamId ?? null, p.room?.slice(0, 50) || null, userId],
    );
  }
  await logAudit({ schoolId, userId, action: 'LESSON_DEVICE_SCOPE_CHANGED', entityType: 'device', entityId: p.deviceSn, details: { scope: p.scope, classId: p.classId ?? null, room: p.room ?? null } });
  return true;
}

async function loadDeviceMap(schoolId: number, sns: string[]): Promise<Map<string, DeviceInfo>> {
  const map = new Map<string, DeviceInfo>();
  if (!sns.length) return map;
  const rows = (await query(
    `SELECT device_sn, scope, class_id, stream_id, room FROM device_attendance_scopes
      WHERE school_id = ? AND device_sn IN (${sns.map(() => '?').join(',')})`,
    [schoolId, ...sns],
  )) as any[];
  for (const r of rows) {
    map.set(r.device_sn, { scope: r.scope, classId: r.class_id != null ? Number(r.class_id) : null, streamId: r.stream_id != null ? Number(r.stream_id) : null, room: r.room ?? null });
  }
  return map;
}

// ── occurrences (immutable per-date snapshot of a timetable entry) ─────────

export interface Occurrence {
  id: number; timetableEntryId: number; lessonDate: string; classId: number; streamId: number | null;
  subjectId: number; teacherId: number | null; room: string | null; periodName: string | null;
  startMs: number; endMs: number; termId: number | null;
}

const toOcc = (r: any): Occurrence => ({
  id: Number(r.id), timetableEntryId: Number(r.timetable_entry_id), lessonDate: String(r.lesson_date).slice(0, 10),
  classId: Number(r.class_id), streamId: r.stream_id != null ? Number(r.stream_id) : null, subjectId: Number(r.subject_id),
  teacherId: r.teacher_id != null ? Number(r.teacher_id) : null, room: r.room ?? null, periodName: r.period_name ?? null,
  startMs: new Date(r.start_at).getTime(), endMs: new Date(r.end_at).getTime(), termId: r.term_id != null ? Number(r.term_id) : null,
});

/**
 * Materialise (idempotently) the lessons scheduled for a school-local date.
 * Existing occurrences are frozen once they hold attendance rows, so editing
 * the timetable never rewrites history; untouched future/today ones are refreshed.
 */
export async function ensureOccurrences(schoolId: number, localDate: string, classId?: number): Promise<Occurrence[]> {
  const tp = await resolveTimePolicy(schoolId);
  const entries = (await query(
    `SELECT e.id, e.class_id, e.stream_id, e.subject_id, e.teacher_id, e.room, p.name AS period_name, p.start_time, p.end_time
       FROM timetable_entries e
       JOIN timetable_periods p ON p.id = e.period_id
      WHERE e.school_id = ? AND e.day_of_week = ? AND COALESCE(p.is_break, 0) = 0
        ${classId ? 'AND e.class_id = ?' : ''}`,
    classId ? [schoolId, isoWeekday(localDate), classId] : [schoolId, isoWeekday(localDate)],
  ).catch(() => [])) as any[];
  if (!entries.length) return [];

  const term = ((await query(
    `SELECT id, academic_year_id FROM terms WHERE school_id = ? AND deleted_at IS NULL AND start_date <= ? AND end_date >= ? ORDER BY is_active DESC, start_date DESC LIMIT 1`,
    [schoolId, localDate, localDate],
  ).catch(() => [])) as any[])[0];

  const existing = (await query(
    `SELECT o.id, o.timetable_entry_id,
            (SELECT COUNT(*) FROM lesson_attendance a WHERE a.occurrence_id = o.id) AS att_rows
       FROM lesson_occurrences o WHERE o.school_id = ? AND o.lesson_date = ?`,
    [schoolId, localDate],
  )) as any[];
  const existingByEntry = new Map(existing.map((r) => [Number(r.timetable_entry_id), r]));
  const todayLocal = localDateOf(Date.now(), tp.offsetMinutes);

  for (const e of entries) {
    const startAt = new Date(localToUtcMs(localDate, String(e.start_time), tp.offsetMinutes));
    const endAt = new Date(localToUtcMs(localDate, String(e.end_time), tp.offsetMinutes));
    const ex = existingByEntry.get(Number(e.id));
    if (!ex) {
      await query(
        `INSERT IGNORE INTO lesson_occurrences
           (school_id, timetable_entry_id, lesson_date, class_id, stream_id, subject_id, teacher_id, room, period_name, start_at, end_at, term_id, academic_year_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [schoolId, e.id, localDate, e.class_id, e.stream_id, e.subject_id, e.teacher_id, e.room, e.period_name, startAt, endAt, term?.id ?? null, term?.academic_year_id ?? null],
      );
    } else if (Number(ex.att_rows) === 0 && localDate >= todayLocal) {
      await query(
        `UPDATE lesson_occurrences SET class_id = ?, stream_id = ?, subject_id = ?, teacher_id = ?, room = ?, period_name = ?, start_at = ?, end_at = ?
          WHERE id = ? AND school_id = ?`,
        [e.class_id, e.stream_id, e.subject_id, e.teacher_id, e.room, e.period_name, startAt, endAt, ex.id, schoolId],
      );
    }
  }

  const rows = (await query(
    `SELECT * FROM lesson_occurrences WHERE school_id = ? AND lesson_date = ? ${classId ? 'AND class_id = ?' : ''} ORDER BY start_at`,
    classId ? [schoolId, localDate, classId] : [schoolId, localDate],
  )) as any[];
  return rows.map(toOcc);
}

// ── computing the day ──────────────────────────────────────────────────────

export interface LearnerCtx { personId: number; studentId: number; classId: number; streamId: number | null; canPunch: boolean }

/**
 * Recompute and persist lesson verdicts for the given learners on a local date.
 * `learners` may hold several rows per person (multi-programme enrolment).
 */
export async function computeLessonDay(
  schoolId: number, localDate: string, learners: LearnerCtx[], nowMs = Date.now(),
): Promise<void> {
  const policy = await getLessonPolicy(schoolId);
  if (!policy.enabled || learners.length === 0) return;
  const tp = await resolveTimePolicy(schoolId);

  const classIds = [...new Set(learners.map((l) => l.classId))];
  const occByClass = new Map<number, Occurrence[]>();
  for (const cid of classIds) occByClass.set(cid, await ensureOccurrences(schoolId, localDate, cid));
  if (![...occByClass.values()].some((o) => o.length)) return;

  const dayStart = new Date(localToUtcMs(localDate, '00:00:00', tp.offsetMinutes));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const personIds = [...new Set(learners.map((l) => l.personId))];
  const punchRows: any[] = [];
  for (let i = 0; i < personIds.length; i += 400) {
    const chunk = personIds.slice(i, i + 400);
    punchRows.push(...((await query(
      `SELECT id, person_id, device_sn, punch_at FROM attendance_raw_events
        WHERE school_id = ? AND matched = 1 AND punch_at >= ? AND punch_at < ? AND person_id IN (${chunk.map(() => '?').join(',')})`,
      [schoolId, dayStart, dayEnd, ...chunk],
    )) as any[]));
  }
  const punchesByPerson = new Map<number, Punch[]>();
  for (const r of punchRows) {
    const list = punchesByPerson.get(Number(r.person_id)) ?? [];
    list.push({ id: Number(r.id), atMs: new Date(r.punch_at).getTime(), deviceSn: String(r.device_sn) });
    punchesByPerson.set(Number(r.person_id), list);
  }
  const deviceMap = await loadDeviceMap(schoolId, [...new Set(punchRows.map((r) => String(r.device_sn)))]);
  const deviceFor = (sn: string) => resolveDevice(deviceMap.get(sn), policy);

  // manual corrections are authoritative and never overwritten
  const occIds = [...new Set([...occByClass.values()].flat().map((o) => o.id))];
  const manual = new Set<string>();
  if (occIds.length) {
    const mrows = (await query(
      `SELECT occurrence_id, person_id FROM lesson_attendance WHERE school_id = ? AND source = 'manual' AND occurrence_id IN (${occIds.map(() => '?').join(',')})`,
      [schoolId, ...occIds],
    )) as any[];
    for (const m of mrows) manual.add(`${m.occurrence_id}:${m.person_id}`);
  }

  const out: any[][] = [];
  for (const l of learners) {
    const occs = (occByClass.get(l.classId) ?? []).filter((o) => o.streamId == null || l.streamId == null || o.streamId === l.streamId);
    if (!occs.length) continue;
    const lessons: LessonRef[] = occs.map((o) => ({ id: o.id, startMs: o.startMs, endMs: o.endMs, classId: o.classId, streamId: o.streamId, room: o.room }));
    const assign = assignPunchesToLessons(lessons, punchesByPerson.get(l.personId) ?? [], policy, deviceFor);
    for (const lesson of lessons) {
      if (manual.has(`${lesson.id}:${l.personId}`)) continue;
      const d = deriveLessonStatus({ lesson, punches: assign.byLesson.get(lesson.id) ?? [], policy, nowMs, canPunch: l.canPunch });
      out.push([schoolId, lesson.id, l.personId, l.studentId, d.status, d.punchCount > 0 ? 'biometric' : 'policy',
        d.firstMs ? new Date(d.firstMs) : null, d.lastMs ? new Date(d.lastMs) : null, d.punchCount, d.minutesLate, d.deviceSn, d.exception]);
    }
  }
  for (let i = 0; i < out.length; i += 200) {
    const chunk = out.slice(i, i + 200);
    await query(
      `INSERT INTO lesson_attendance
         (school_id, occurrence_id, person_id, student_id, status, source, first_punch_at, last_punch_at, punch_count, minutes_late, device_sn, exception)
       VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
       ON DUPLICATE KEY UPDATE status = IF(source = 'manual', status, VALUES(status)),
         first_punch_at = IF(source = 'manual', first_punch_at, VALUES(first_punch_at)),
         last_punch_at = IF(source = 'manual', last_punch_at, VALUES(last_punch_at)),
         punch_count = IF(source = 'manual', punch_count, VALUES(punch_count)),
         minutes_late = IF(source = 'manual', minutes_late, VALUES(minutes_late)),
         device_sn = IF(source = 'manual', device_sn, VALUES(device_sn)),
         exception = IF(source = 'manual', exception, VALUES(exception)),
         student_id = VALUES(student_id),
         source = IF(source = 'manual', source, VALUES(source))`,
      chunk.flat(),
    );
  }
}

/** Active learners of a class (optionally stream) with biometric capability flag. */
export async function loadClassLearners(schoolId: number, classId: number, streamId: number | null): Promise<LearnerCtx[]> {
  const rows = (await query(
    `SELECT s.id AS student_id, s.person_id, e.class_id, e.stream_id,
            EXISTS(SELECT 1 FROM biometric_enrollments b WHERE b.school_id = s.school_id AND b.person_id = s.person_id AND b.status = 'active') AS can_punch
       FROM students s
       JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' AND e.deleted_at IS NULL
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.person_id IS NOT NULL AND e.class_id = ?
        ${streamId ? 'AND e.stream_id = ?' : ''}`,
    streamId ? [schoolId, classId, streamId] : [schoolId, classId],
  ).catch(() => [])) as any[];
  const seen = new Set<number>();
  const out: LearnerCtx[] = [];
  for (const r of rows) {
    if (seen.has(Number(r.student_id))) continue;
    seen.add(Number(r.student_id));
    out.push({ personId: Number(r.person_id), studentId: Number(r.student_id), classId: Number(r.class_id), streamId: r.stream_id != null ? Number(r.stream_id) : null, canPunch: Number(r.can_punch) === 1 });
  }
  return out;
}

/**
 * Hook: called right after a raw punch is persisted. Never throws and returns
 * immediately when lesson attendance is off (the common case).
 */
export async function onRawPunchForLessons(schoolId: number, personId: number | null, roleType: string | null, punchAtMs: number): Promise<void> {
  try {
    if (!personId || roleType !== 'student') return;
    const policy = await getLessonPolicy(schoolId);
    if (!policy.enabled) return;
    const tp = await resolveTimePolicy(schoolId);
    const rows = (await query(
      `SELECT s.id AS student_id, e.class_id, e.stream_id,
              EXISTS(SELECT 1 FROM biometric_enrollments b WHERE b.school_id = s.school_id AND b.person_id = s.person_id AND b.status = 'active') AS can_punch
         FROM students s JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' AND e.deleted_at IS NULL
        WHERE s.school_id = ? AND s.person_id = ? AND s.deleted_at IS NULL`,
      [schoolId, personId],
    )) as any[];
    const learners: LearnerCtx[] = rows.map((r) => ({
      personId, studentId: Number(r.student_id), classId: Number(r.class_id),
      streamId: r.stream_id != null ? Number(r.stream_id) : null, canPunch: Number(r.can_punch) === 1,
    }));
    await computeLessonDay(schoolId, localDateOf(punchAtMs, tp.offsetMinutes), learners);
  } catch (e: any) {
    console.warn('[lesson-attendance] punch hook failed:', e?.message);
  }
}

// ── lessons list + roster ──────────────────────────────────────────────────

export interface LessonListItem extends Occurrence {
  className: string | null; streamName: string | null; subjectName: string | null; teacherName: string | null;
  counts: { present: number; late: number; absent: number; excused: number; pending: number };
}

export async function listLessonsForDay(schoolId: number, localDate: string, filter: { teacherStaffId?: number | null; classId?: number }): Promise<LessonListItem[]> {
  const occs = await ensureOccurrences(schoolId, localDate, filter.classId);
  const wanted = filter.teacherStaffId != null ? occs.filter((o) => o.teacherId === filter.teacherStaffId) : occs;
  if (!wanted.length) return [];
  const ids = wanted.map((o) => o.id);
  const ph = ids.map(() => '?').join(',');
  const meta = (await query(
    `SELECT o.id, c.name AS class_name, st.name AS stream_name, sub.name AS subject_name,
            TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS teacher_name
       FROM lesson_occurrences o
       LEFT JOIN classes c ON c.id = o.class_id
       LEFT JOIN streams st ON st.id = o.stream_id
       LEFT JOIN subjects sub ON sub.id = o.subject_id
       LEFT JOIN staff sf ON sf.id = o.teacher_id
       LEFT JOIN people p ON p.id = sf.person_id
      WHERE o.school_id = ? AND o.id IN (${ph})`,
    [schoolId, ...ids],
  )) as any[];
  const counts = (await query(
    `SELECT occurrence_id, status, COUNT(*) n FROM lesson_attendance WHERE school_id = ? AND occurrence_id IN (${ph}) GROUP BY occurrence_id, status`,
    [schoolId, ...ids],
  )) as any[];
  const metaBy = new Map(meta.map((m) => [Number(m.id), m]));
  return wanted.map((o) => {
    const m = metaBy.get(o.id) ?? {};
    const c = { present: 0, late: 0, absent: 0, excused: 0, pending: 0 };
    for (const r of counts) if (Number(r.occurrence_id) === o.id && r.status in c) (c as any)[r.status] = Number(r.n);
    return { ...o, className: m.class_name ?? null, streamName: m.stream_name ?? null, subjectName: m.subject_name ?? null, teacherName: m.teacher_name || null, counts: c };
  });
}

export async function getOccurrence(schoolId: number, occurrenceId: number): Promise<Occurrence | null> {
  const rows = (await query('SELECT * FROM lesson_occurrences WHERE id = ? AND school_id = ? LIMIT 1', [occurrenceId, schoolId])) as any[];
  return rows[0] ? toOcc(rows[0]) : null;
}

export interface RosterRow {
  personId: number; studentId: number | null; name: string; admissionNo: string | null;
  status: LessonStatus; source: string; firstPunchAt: string | null; minutesLate: number; punchCount: number;
  exception: string | null; reason: string | null; canPunch: boolean;
}

export async function buildRoster(schoolId: number, occurrenceId: number) {
  const occ = await getOccurrence(schoolId, occurrenceId);
  if (!occ) return null;
  const policy = await getLessonPolicy(schoolId);
  const learners = await loadClassLearners(schoolId, occ.classId, occ.streamId);
  if (policy.enabled && policy.autoRoster) await computeLessonDay(schoolId, occ.lessonDate, learners);

  const rows = (await query(
    `SELECT a.person_id, a.student_id, a.status, a.source, a.first_punch_at, a.minutes_late, a.punch_count, a.exception, a.reason
       FROM lesson_attendance a WHERE a.school_id = ? AND a.occurrence_id = ?`,
    [schoolId, occurrenceId],
  )) as any[];
  const byPerson = new Map(rows.map((r) => [Number(r.person_id), r]));

  const ids = learners.map((l) => l.personId);
  const names = new Map<number, { name: string; adm: string | null }>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const n = (await query(
      `SELECT s.person_id, s.admission_no, p.first_name, p.last_name FROM students s JOIN people p ON p.id = s.person_id
        WHERE s.school_id = ? AND s.person_id IN (${chunk.map(() => '?').join(',')})`,
      [schoolId, ...chunk],
    )) as any[];
    for (const r of n) names.set(Number(r.person_id), { name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(), adm: r.admission_no ?? null });
  }

  const roster: RosterRow[] = learners.map((l) => {
    const a = byPerson.get(l.personId);
    const nm = names.get(l.personId);
    return {
      personId: l.personId, studentId: l.studentId, name: nm?.name ?? 'Unknown', admissionNo: nm?.adm ?? null,
      status: (a?.status as LessonStatus) ?? 'pending', source: a?.source ?? 'policy',
      firstPunchAt: a?.first_punch_at ? new Date(a.first_punch_at).toISOString() : null,
      minutesLate: Number(a?.minutes_late ?? 0), punchCount: Number(a?.punch_count ?? 0),
      exception: a?.exception ?? (l.canPunch ? null : 'not_biometrically_enrolled'), reason: a?.reason ?? null, canPunch: l.canPunch,
    };
  }).sort((x, y) => x.name.localeCompare(y.name));

  return { occurrence: occ, policy, roster, summary: summarizeRoster(roster) };
}

// ── manual correction ──────────────────────────────────────────────────────

export type CorrectionResult = { ok: true } | { ok: false; error: string; status: number };

export async function correctLessonAttendance(p: {
  schoolId: number; userId: number; occurrenceId: number; personId: number;
  status: LessonStatus | 'auto'; reason: string;
}): Promise<CorrectionResult> {
  const occ = await getOccurrence(p.schoolId, p.occurrenceId);
  if (!occ) return { ok: false, error: 'Lesson not found', status: 404 };
  const learners = await loadClassLearners(p.schoolId, occ.classId, occ.streamId);
  const learner = learners.find((l) => l.personId === p.personId);
  if (!learner) return { ok: false, error: 'That learner is not on this lesson\'s roster', status: 404 };

  if (p.status === 'auto') {
    await query(`DELETE FROM lesson_attendance WHERE school_id = ? AND occurrence_id = ? AND person_id = ? AND source = 'manual'`, [p.schoolId, p.occurrenceId, p.personId]);
    await computeLessonDay(p.schoolId, occ.lessonDate, [learner]);
    await logAudit({ schoolId: p.schoolId, userId: p.userId, action: 'LESSON_ATTENDANCE_CORRECTION_REVERTED', entityType: 'lesson_occurrence', entityId: p.occurrenceId, details: { personId: p.personId, reason: p.reason.slice(0, 200) } });
    return { ok: true };
  }
  if (!MANUAL_STATUSES.includes(p.status)) return { ok: false, error: 'Status must be present, late, absent or excused', status: 400 };
  const reason = p.reason.trim();
  if (reason.length < 3) return { ok: false, error: 'A reason is required for every correction', status: 400 };

  const prev = (await query('SELECT status, source FROM lesson_attendance WHERE occurrence_id = ? AND person_id = ? AND school_id = ? LIMIT 1', [p.occurrenceId, p.personId, p.schoolId])) as any[];
  await query(
    `INSERT INTO lesson_attendance (school_id, occurrence_id, person_id, student_id, status, source, reason, corrected_by, corrected_at)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE status = VALUES(status), source = 'manual', reason = VALUES(reason),
       corrected_by = VALUES(corrected_by), corrected_at = VALUES(corrected_at), exception = NULL`,
    [p.schoolId, p.occurrenceId, p.personId, learner.studentId, p.status, reason.slice(0, 255), p.userId],
  );
  await logAudit({
    schoolId: p.schoolId, userId: p.userId, action: 'LESSON_ATTENDANCE_CORRECTED', entityType: 'lesson_occurrence', entityId: p.occurrenceId,
    details: { personId: p.personId, from: prev[0]?.status ?? null, fromSource: prev[0]?.source ?? null, to: p.status, reason: reason.slice(0, 200) },
  });
  return { ok: true };
}

/** Sweep helper: finalise today's lessons for every class that has one (absent verdicts after the delay). */
export async function finalizeLessonDay(schoolId: number, localDate?: string): Promise<number> {
  const policy = await getLessonPolicy(schoolId);
  if (!policy.enabled) return 0;
  const tp = await resolveTimePolicy(schoolId);
  const date = localDate ?? localDateOf(Date.now(), tp.offsetMinutes);
  const occs = await ensureOccurrences(schoolId, date);
  let n = 0;
  const done = new Set<string>();
  for (const o of occs) {
    const key = `${o.classId}:${o.streamId ?? 0}`;
    if (done.has(key)) continue;
    done.add(key);
    const learners = await loadClassLearners(schoolId, o.classId, o.streamId);
    await computeLessonDay(schoolId, date, learners);
    n += learners.length;
  }
  return n;
}
