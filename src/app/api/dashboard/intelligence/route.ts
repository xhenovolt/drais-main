import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// DRAIS Behavioral Intelligence Engine
// Every metric is school-scoped. No fake data. Only DB-backed conclusions.
// ─────────────────────────────────────────────────────────────────────────────

function toDateStr(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).split('T')[0];
}

function n(v: unknown): number {
  return Number(v) || 0;
}

function buildReason(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const lastDate = toDateStr(row.last_attendance_date);
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  if (!lastDate || lastDate < cutoff) {
    parts.push('No attendance in 7+ days');
  }
  const absences = n(row.absences_7d);
  if (absences >= 3) {
    parts.push(`${absences} absences in last 7 days`);
  }
  const present = n(row.present_7d);
  const total = n(row.total_marked_7d);
  if (total > 0 && present / total < 0.5) {
    parts.push(`${Math.round((present / total) * 100)}% attendance rate`);
  }
  return parts.join(' · ') || 'At-risk pattern detected';
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { schoolId } = session;
  let connection;

  try {
    connection = await getConnection();

    const [
      todayStats,
      weeklyTrend,
      monthlyTrend,
      riskStudents,
      classBreakdown,
      genderBreakdown,
      deviceStats,
      yesterdayStats,
    ] = await Promise.all([

      // ── MODULE 1: TODAY STATUS ───────────────────────────────────────────
      connection.execute(
        `SELECT
           (SELECT COUNT(*) FROM students WHERE school_id = ? AND status = 'active') AS total_students,
           COUNT(DISTINCT CASE WHEN sa.status = 'present' THEN sa.student_id END)    AS present,
           COUNT(DISTINCT CASE WHEN sa.status = 'absent'  THEN sa.student_id END)    AS absent,
           COUNT(DISTINCT CASE WHEN sa.status = 'late'    THEN sa.student_id END)    AS late
         FROM student_attendance sa
         INNER JOIN students ss ON ss.id = sa.student_id AND ss.school_id = ?
         WHERE sa.date = CURDATE()`,
        [schoolId, schoolId],
      ),

      // ── MODULE 1: 7-DAY TREND ────────────────────────────────────────────
      connection.execute(
        `SELECT
           sa.date,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present,
           COUNT(DISTINCT CASE WHEN sa.status = 'absent'            THEN sa.student_id END) AS absent
         FROM student_attendance sa
         INNER JOIN students ss ON ss.id = sa.student_id AND ss.school_id = ?
         WHERE sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY sa.date
         ORDER BY sa.date ASC`,
        [schoolId],
      ),

      // ── MODULE 1: 30-DAY TREND ───────────────────────────────────────────
      connection.execute(
        `SELECT
           sa.date,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present,
           COUNT(DISTINCT CASE WHEN sa.status = 'absent'            THEN sa.student_id END) AS absent
         FROM student_attendance sa
         INNER JOIN students ss ON ss.id = sa.student_id AND ss.school_id = ?
         WHERE sa.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY sa.date
         ORDER BY sa.date ASC`,
        [schoolId],
      ),

      // ── MODULE 2: BEHAVIORAL RISK ENGINE ─────────────────────────────────
      // Signal 1 (+1): No attendance record in last 7 days at all
      // Signal 2 (+1): Attendance rate < 50% over last 7 marked days
      // Signal 3 (+1): 3+ absences in last 7 recorded days
      // risk_score = sum of signals → 0-1=LOW, 2=MEDIUM, 3=HIGH
      connection.execute(
        `SELECT
           s.id                                                               AS student_id,
           CONCAT(p.first_name, ' ', p.last_name)                            AS name,
           COALESCE(c.name, 'Unknown Class')                                 AS class_name,
           p.gender,
           MAX(sa.date)                                                       AS last_attendance_date,
           SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND sa.status = 'absent'  THEN 1 ELSE 0 END) AS absences_7d,
           SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND sa.status IN ('present','late') THEN 1 ELSE 0 END) AS present_7d,
           SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS total_marked_7d,
           (
             CASE WHEN (MAX(sa.date) IS NULL OR MAX(sa.date) < DATE_SUB(CURDATE(), INTERVAL 7 DAY)) THEN 1 ELSE 0 END
             +
             CASE WHEN
               SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) > 0
               AND (SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND sa.status IN ('present','late') THEN 1 ELSE 0 END) * 1.0
                    / SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END)) < 0.5
             THEN 1 ELSE 0 END
             +
             CASE WHEN SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND sa.status = 'absent' THEN 1 ELSE 0 END) >= 3
             THEN 1 ELSE 0 END
           ) AS risk_score
         FROM students s
         JOIN  people      p  ON p.id = s.person_id
         LEFT JOIN enrollments  e  ON e.student_id = s.id AND e.school_id = s.school_id AND e.status = 'active'
         LEFT JOIN classes      c  ON c.id = e.class_id AND c.school_id = s.school_id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id
         WHERE s.school_id = ? AND s.status = 'active'
         GROUP BY s.id, p.first_name, p.last_name, c.name, p.gender
         HAVING risk_score > 0
         ORDER BY risk_score DESC
         LIMIT 60`,
        [schoolId],
      ),

      // ── MODULE 3: CLASS BREAKDOWN ─────────────────────────────────────────
      connection.execute(
        `SELECT
           c.name                                                                                      AS class_name,
           COUNT(DISTINCT s.id)                                                                        AS total_students,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') AND sa.date = CURDATE() THEN sa.student_id END) AS present_today,
           COUNT(DISTINCT CASE WHEN sa.status = 'absent'            AND sa.date = CURDATE() THEN sa.student_id END) AS absent_today,
           COUNT(DISTINCT CASE WHEN sa.status = 'late'              AND sa.date = CURDATE() THEN sa.student_id END) AS late_today
         FROM classes c
         JOIN enrollments e ON e.class_id = c.id AND e.school_id = c.school_id AND e.status = 'active'
         JOIN students    s ON s.id = e.student_id AND s.status = 'active'
         LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = CURDATE()
         WHERE c.school_id = ?
         GROUP BY c.id, c.name
         ORDER BY c.name ASC
         LIMIT 30`,
        [schoolId],
      ),

      // ── MODULE 3: GENDER BREAKDOWN ────────────────────────────────────────
      connection.execute(
        `SELECT
           COALESCE(p.gender, 'Unknown') AS gender,
           COUNT(DISTINCT s.id)          AS total,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') AND sa.date = CURDATE() THEN sa.student_id END) AS present_today
         FROM students s
         JOIN people p ON p.id = s.person_id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = CURDATE()
         WHERE s.school_id = ? AND s.status = 'active'
         GROUP BY p.gender`,
        [schoolId],
      ),

      // ── MODULE 5: DEVICE HEALTH ───────────────────────────────────────────
      connection.execute(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'active' AND last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END)  AS online,
           SUM(CASE WHEN status = 'active' AND (last_seen IS NULL OR last_seen <= DATE_SUB(NOW(), INTERVAL 5 MINUTE)) THEN 1 ELSE 0 END) AS offline
         FROM devices
         WHERE school_id = ? AND deleted_at IS NULL`,
        [schoolId],
      ),

      // Yesterday attendance (for drop detection)
      connection.execute(
        `SELECT COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present
         FROM student_attendance sa
         INNER JOIN students ss ON ss.id = sa.student_id AND ss.school_id = ?
         WHERE sa.date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`,
        [schoolId],
      ),
    ]);

    // ── NORMALISE RESULTS ────────────────────────────────────────────────────
    const todayRow    = (todayStats[0]     as any[])[0] ?? {};
    const weekly      = (weeklyTrend[0]    as any[]).map(r => ({
      date:    toDateStr(r.date) ?? '',
      present: n(r.present),
      absent:  n(r.absent),
    }));
    const monthly     = (monthlyTrend[0]   as any[]).map(r => ({
      date:    toDateStr(r.date) ?? '',
      present: n(r.present),
      absent:  n(r.absent),
    }));
    const riskList    = (riskStudents[0]   as any[]).map(r => ({
      student_id:          r.student_id,
      name:                String(r.name ?? ''),
      class_name:          String(r.class_name ?? 'Unknown'),
      gender:              String(r.gender ?? ''),
      last_attendance_date: toDateStr(r.last_attendance_date),
      absences_7d:         n(r.absences_7d),
      present_7d:          n(r.present_7d),
      total_marked_7d:     n(r.total_marked_7d),
      risk_score:          n(r.risk_score),
      risk_level:          n(r.risk_score) >= 3 ? 'HIGH' : n(r.risk_score) === 2 ? 'MEDIUM' : 'LOW',
      reason:              buildReason(r),
    }));
    const classes     = (classBreakdown[0] as any[]).map(r => ({
      class_name:    String(r.class_name ?? ''),
      total:         n(r.total_students),
      present:       n(r.present_today),
      absent:        n(r.absent_today),
      late:          n(r.late_today),
      rate:          n(r.total_students) > 0
                       ? Math.round((n(r.present_today) / n(r.total_students)) * 100)
                       : 0,
    }));
    const genders     = (genderBreakdown[0] as any[]).map(r => ({
      gender:  String(r.gender ?? 'Unknown'),
      total:   n(r.total),
      present: n(r.present_today),
      rate:    n(r.total) > 0 ? Math.round((n(r.present_today) / n(r.total)) * 100) : 0,
    }));
    const devRow      = (deviceStats[0]    as any[])[0] ?? {};
    const yestRow     = (yesterdayStats[0] as any[])[0] ?? {};

    const totalStudents  = n(todayRow.total_students);
    const presentToday   = n(todayRow.present);
    const absentToday    = n(todayRow.absent);
    const lateToday      = n(todayRow.late);
    const attendanceRate = totalStudents > 0
      ? Math.round((presentToday / totalStudents) * 100)
      : 0;
    const yesterdayPresent  = n(yestRow.present);
    const attendanceDropPct = yesterdayPresent > 0
      ? Math.round(((presentToday - yesterdayPresent) / yesterdayPresent) * 100)
      : 0;
    const highRisk   = riskList.filter(s => s.risk_level === 'HIGH').length;
    const mediumRisk = riskList.filter(s => s.risk_level === 'MEDIUM').length;
    const lowRisk    = riskList.filter(s => s.risk_level === 'LOW').length;
    const offlineDevices = n(devRow.offline);

    // ── SMART ALERTS ──────────────────────────────────────────────────────────
    const alerts: { type: string; severity: 'critical' | 'warning' | 'info'; message: string }[] = [];

    if (attendanceRate > 0 && attendanceRate < 70) {
      alerts.push({
        type: 'attendance',
        severity: 'critical',
        message: `Critical attendance — only ${attendanceRate}% of students present today. Investigate immediately.`,
      });
    } else if (attendanceDropPct <= -20 && yesterdayPresent > 0) {
      alerts.push({
        type: 'attendance',
        severity: 'warning',
        message: `Attendance dropped ${Math.abs(attendanceDropPct)}% compared to yesterday. ${absentToday} students absent.`,
      });
    }

    if (highRisk > 0) {
      alerts.push({
        type: 'risk',
        severity: 'critical',
        message: `${highRisk} student${highRisk > 1 ? 's are' : ' is'} at HIGH risk of becoming a dropout. Act today.`,
      });
    }
    if (mediumRisk > 0) {
      alerts.push({
        type: 'risk',
        severity: 'warning',
        message: `${mediumRisk} student${mediumRisk > 1 ? 's' : ''} showing concerning attendance patterns. Monitor closely.`,
      });
    }
    if (offlineDevices > 0) {
      alerts.push({
        type: 'device',
        severity: 'warning',
        message: `${offlineDevices} biometric device${offlineDevices > 1 ? 's are' : ' is'} offline — attendance data may be incomplete.`,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        today: {
          total_students: totalStudents,
          present:         presentToday,
          absent:          absentToday,
          late:            lateToday,
          rate:            attendanceRate,
          yesterday_present: yesterdayPresent,
          change_pct:      attendanceDropPct,
        },
        weekly_trend:    weekly,
        monthly_trend:   monthly,
        risk: {
          total:    riskList.length,
          high:     highRisk,
          medium:   mediumRisk,
          low:      lowRisk,
          students: riskList,
        },
        class_breakdown:  classes,
        gender_breakdown: genders,
        devices: {
          total:   n(devRow.total),
          online:  n(devRow.online),
          offline: offlineDevices,
        },
        alerts,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[intelligence] Error:', msg);
    return NextResponse.json({ error: 'Failed to load intelligence data', detail: msg }, { status: 500 });
  } finally {
    if (connection && typeof (connection as any).release === 'function') {
      (connection as any).release();
    }
  }
}
