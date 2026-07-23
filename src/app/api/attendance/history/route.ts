import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ensureAttendanceEngineSchema } from '@/lib/attendance/migrations/attendance-tables-schema';
import { AttendanceFormatter } from '@/lib/attendance/export/AttendanceFormatter';
import { AttendancePresentationModel } from '@/lib/attendance/export/AttendancePresentationModel';
import { scoreRecord } from '@/lib/attendance/confidence-scoring';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/history
 *
 * Canonical punch history for the attendance logs page.
 * Reads attendance_raw_events so records remain visible even if the
 * biometric device goes offline or is powered down later.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { schoolId } = session;
  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') || 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  // Rows-per-page: 10/20/50/100/250, or 'all' (bounded at 5000 so a
  // misbehaving client can't stream the whole history table).
  const limitRaw = url.searchParams.get('limit') || '50';
  const limit = limitRaw === 'all'
    ? 5000
    : Math.min(250, Math.max(1, parseInt(limitRaw, 10) || 50));
  const offset = (page - 1) * limit;
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const deviceSn = url.searchParams.get('device_sn');
  const matchedFilter = url.searchParams.get('matched');
  const userType = url.searchParams.get('user_type');
  const search = url.searchParams.get('search');
  const classId = url.searchParams.get('class_id');
  const gender = url.searchParams.get('gender');

  try {
    await ensureAttendanceEngineSchema();
    const formatter = await AttendanceFormatter.forSchool(schoolId);

    const conditions: string[] = ['ar.school_id = ?'];
    const params: any[] = [schoolId];

    // Optional intra-day window (HH:MM) — "this morning / afternoon /
    // evening / custom". Applied on top of the date filters; when no date
    // is given the window means TODAY (school-local).
    const timeFrom = url.searchParams.get('time_from'); // HH:MM
    const timeTo = url.searchParams.get('time_to');     // HH:MM
    const hhmm = /^([01]\d|2[0-3]):([0-5]\d)$/;
    /** School-local date+time → UTC SQL, via the day-start boundary + minutes. */
    const timeBoundary = (localDate: string, t: string, endOfMinute: boolean): string => {
      const startSql = formatter.toUtcBoundary(localDate, 'start');
      const startMs = Date.parse(`${startSql.replace(' ', 'T')}Z`);
      const [h, m] = t.split(':').map(Number);
      const ms = startMs + ((h * 60 + m) * 60 + (endOfMinute ? 59 : 0)) * 1000;
      return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    };
    const defaultDay = () => dateFrom || dateTo || new Date().toISOString().slice(0, 10);

    if (timeFrom && hhmm.test(timeFrom)) {
      conditions.push('ar.punch_at >= ?');
      params.push(timeBoundary(dateFrom || defaultDay(), timeFrom, false));
    } else if (dateFrom) {
      conditions.push('ar.punch_at >= ?');
      params.push(formatter.toUtcBoundary(dateFrom, 'start'));
    }
    if (timeTo && hhmm.test(timeTo)) {
      conditions.push('ar.punch_at <= ?');
      params.push(timeBoundary(dateTo || defaultDay(), timeTo, true));
    } else if (dateTo) {
      conditions.push('ar.punch_at <= ?');
      params.push(formatter.toUtcBoundary(dateTo, 'end'));
    }
    if (deviceSn) {
      conditions.push('ar.device_sn = ?');
      params.push(deviceSn);
    }
    if (matchedFilter === '1' || matchedFilter === '0') {
      conditions.push('ar.matched = ?');
      params.push(Number(matchedFilter));
    }
    // Strict tab semantics: a punch is a Learner/Staff row ONLY when it is
    // matched with that role. Unmatched/NULL-role punches belong solely to
    // the Unmatched tab (the old COALESCE defaults dumped every unmatched
    // punch into Learners AND counted it under Staff).
    if (tab === 'learners' || userType === 'student') {
      conditions.push("ar.role_type = 'student' AND ar.matched = 1");
    } else if (tab === 'staff' || userType === 'staff') {
      conditions.push("ar.role_type = 'staff' AND ar.matched = 1");
    } else if (tab === 'unmatched') {
      conditions.push('(ar.matched = 0 OR ar.person_id IS NULL)');
    }
    if (search) {
      conditions.push(
        `(ar.device_user_id LIKE ? OR ar.display_name LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR dud.device_name LIKE ?)`,
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (classId) {
      conditions.push(
        `EXISTS (
          SELECT 1
            FROM students s
            JOIN enrollments e ON e.student_id = s.id
           WHERE s.person_id = ar.person_id
             AND e.status = 'active'
             AND e.class_id = ?
        )`,
      );
      params.push(Number(classId));
    }
    if (gender) {
      conditions.push('p.gender = ?');
      params.push(gender);
    }

    // Arrival-status quick filter (derived_event stamped by the engine).
    const derived = url.searchParams.get('derived');
    if (derived === 'late') {
      conditions.push(`ar.derived_event = 'ARRIVED_LATE'`);
    } else if (derived === 'early') {
      conditions.push(`ar.derived_event = 'ARRIVED_EARLY'`);
    } else if (derived === 'ontime') {
      conditions.push(`ar.derived_event IN ('ARRIVED','ARRIVED_EARLY')`);
    }

    const where = conditions.join(' AND ');

    // Sortable columns (datatable-style header arrows). Whitelisted only —
    // never interpolate user input into ORDER BY.
    const SORTABLE: Record<string, string> = {
      time: 'ar.punch_at',
      name: `COALESCE(NULLIF(ar.display_name,''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)),''), dud.device_name, '')`,
      pin: 'CAST(ar.device_user_id AS UNSIGNED)',
      device: 'ar.device_sn',
      status: 'ar.derived_event',
      type: 'ar.role_type',
    };
    const sortKey = url.searchParams.get('sort') || 'time';
    const sortCol = SORTABLE[sortKey] || SORTABLE.time;
    const sortDir = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
    const orderBy = `${sortCol} ${sortDir}${sortKey !== 'time' ? ', ar.punch_at DESC' : ''}`;

    const countRows = await query(
      `SELECT COUNT(*) AS total
         FROM attendance_raw_events ar
         LEFT JOIN people p ON ar.person_id = p.id
         LEFT JOIN device_user_directory dud
           ON dud.school_id = ar.school_id
          AND dud.device_sn = ar.device_sn
          AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
        WHERE ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const tabCountsRows = await query(
      `SELECT
         COUNT(*) AS total_all,
         SUM(CASE WHEN ar.role_type = 'student' AND ar.matched = 1 THEN 1 ELSE 0 END) AS total_learners,
         SUM(CASE WHEN ar.role_type = 'staff' AND ar.matched = 1 THEN 1 ELSE 0 END) AS total_staff,
         SUM(CASE WHEN ar.matched = 0 OR ar.person_id IS NULL THEN 1 ELSE 0 END) AS total_unmatched
       FROM attendance_raw_events ar
       LEFT JOIN people p ON ar.person_id = p.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id
        AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
       WHERE ar.school_id = ?`,
      [schoolId],
    );

    const rows = await query(
      `SELECT
         ar.id,
         ar.device_sn,
         CAST(ar.device_user_id AS CHAR) AS device_user_id,
         ar.punch_at AS check_time,
         ar.verify_type,
         ar.io_mode,
         ar.derived_event,
         ar.derived_detail,
         ar.matched,
         ar.is_provisional,
         ar.role_type,
         ar.display_name,
         ar.person_id,
         ar.enrollment_id,
         ar.source,
         ar.resolution_score,
         ar.resolution_path,
         ar.time_source,
         ar.clock_skew_seconds,
         ar.legacy_table,
         ar.legacy_id,
         d.device_name,
         d.location AS device_location,
         d.is_online AS device_online,
         dch.confidence AS clock_confidence,
         dud.device_name AS device_known_name,
         rec.rule_id AS rec_rule_id,
         (rec.id IS NOT NULL) AS has_verdict,
         ob.status AS sms_status,
         p.first_name,
         p.last_name,
         p.photo_url,
         p.gender,
         c.name AS class_name,
         s.admission_no,
         stf.position AS staff_position,
         dep.name AS staff_department
       FROM attendance_raw_events ar
       LEFT JOIN devices d ON ar.device_sn = d.sn
       LEFT JOIN people p ON ar.person_id = p.id
       LEFT JOIN staff stf ON ar.role_type = 'staff' AND stf.person_id = ar.person_id AND stf.school_id = ar.school_id AND stf.deleted_at IS NULL
       LEFT JOIN departments dep ON dep.id = stf.department_id
       LEFT JOIN students s ON p.id = s.person_id AND s.school_id = ar.school_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON e.class_id = c.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id
        AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
       LEFT JOIN device_clock_health dch
         ON dch.school_id = ar.school_id AND dch.device_sn = ar.device_sn
        AND dch.local_date = DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE))
       LEFT JOIN attendance_records rec
         ON rec.school_id = ar.school_id AND rec.person_id = ar.person_id
        AND rec.attendance_date = DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE))
       LEFT JOIN notification_outbox ob
         ON ob.school_id = ar.school_id
        AND ob.subject_person_id = ar.person_id
        AND DATE(ob.created_at) = DATE(ar.punch_at)
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const enriched = (rows as any[]).map((row) => {
      const personName = row.display_name || (row.first_name || row.last_name
        ? [row.first_name, row.last_name].filter(Boolean).join(' ')
        : row.device_known_name || null);

      // Per-record confidence (Phase 3) — the row carries its own trust.
      const confidence = scoreRecord({
        matched: row.matched, personId: row.person_id,
        isProvisional: row.is_provisional, resolutionScore: row.resolution_score ?? null,
        resolutionPath: row.resolution_path ?? null,
        deviceSn: row.device_sn, deviceKnown: !!(row.device_name || row.device_known_name),
        deviceOnline: row.device_online,
        timeSource: row.time_source ?? null, clockSkewSeconds: row.clock_skew_seconds ?? null,
        clockConfidence: row.clock_confidence ?? null,
        wasCorrected: (Number(row.clock_skew_seconds) || 0) !== 0 && row.time_source === 'device' && row.clock_confidence >= 85,
        hasVerdict: !!Number(row.has_verdict), ruleId: row.rec_rule_id ?? null,
        derivedEvent: row.derived_event ?? null,
      });

      return {
        ...row,
        person_name: personName,
        person_type: row.role_type || 'unmatched',
        is_provisional: Boolean(row.is_provisional) || (!row.person_id && Number(row.matched) === 0),
        confidence,
      };
    });

    const data = enriched.map((row) => ({
      ...row,
      presentation: AttendancePresentationModel.fromHistoryRow(row, formatter),
    }));

    return NextResponse.json({
      success: true,
      data,
      presentation: {
        timezone: formatter.timezone,
        visibleCount: data.length,
      },
      tab_counts: {
        all: Number(tabCountsRows[0]?.total_all || 0),
        learners: Number(tabCountsRows[0]?.total_learners || 0),
        staff: Number(tabCountsRows[0]?.total_staff || 0),
        unmatched: Number(tabCountsRows[0]?.total_unmatched || 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[Attendance History] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load attendance history', details: err?.message },
      { status: 500 },
    );
  }
}
