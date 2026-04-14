import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Urgency = 'critical' | 'high' | 'medium' | 'low';
type RecType = 'attendance' | 'fees' | 'academic' | 'device' | 'behavior';

interface Recommendation {
  id: string;
  type: RecType;
  title: string;
  description: string;
  action: string;
  urgency: Urgency;
  affected_count: number;
  affected_entities: { id: number | string; label: string; meta?: string }[];
  action_url: string;
  auto_action_available: boolean;
  auto_action_label?: string;
}

function n(v: unknown): number { return Number(v) || 0; }
const URGENCY_ORDER: Record<Urgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ─────────────────────────────────────────────────────────────────────────────
// GET — generate all recommendations for the current school
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { schoolId } = session;
  let conn;

  try {
    conn = await getConnection();

    // ── Run all detection queries in parallel ─────────────────────────────
    const [
      prolongedAbsences,     // Case 1
      lowClassAttendance,    // Case 2
      lateSpike,             // Case 3
      feeDebtors,            // Case 4
      dropoutCompound,       // Case 5 + 10
      classDecline,          // Case 6+7 (class_results based)
      deviceOffline,         // Case 8
      unmatchedLogs,         // Case 9
      recentDismissals,      // Self-learning suppression
    ] = await Promise.all([

      // ── CASE 1: Students absent 3+ days in last 5 calendar days ──────────
      conn.execute(
        `SELECT
           s.id                                      AS student_id,
           CONCAT(p.first_name,' ',p.last_name)      AS name,
           COALESCE(c.name,'Unknown Class')          AS class_name,
           p.phone,
           SUM(CASE WHEN sa.status='absent' THEN 1 ELSE 0 END) AS absent_count
         FROM students s
         JOIN  people p    ON p.id = s.person_id
         LEFT JOIN enrollments   e  ON e.student_id = s.id AND e.school_id = s.school_id AND e.status='active'
         LEFT JOIN classes       c  ON c.id = e.class_id AND c.school_id = s.school_id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id
                                        AND sa.date >= DATE_SUB(CURDATE(), INTERVAL 5 DAY)
         WHERE s.school_id = ? AND s.status = 'active'
         GROUP BY s.id, p.first_name, p.last_name, c.name, p.phone
         HAVING absent_count >= 3
         ORDER BY absent_count DESC
         LIMIT 60`,
        [schoolId],
      ),

      // ── CASE 2: Classes with < 60% attendance today ───────────────────────
      conn.execute(
        `SELECT
           c.id                                                                                             AS class_id,
           c.name                                                                                           AS class_name,
           COUNT(DISTINCT s.id)                                                                             AS total,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END)                AS present,
           COUNT(DISTINCT CASE WHEN sa.status = 'absent' THEN sa.student_id END)                           AS absent_today,
           ROUND(COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END)
                 / NULLIF(COUNT(DISTINCT s.id),0) * 100, 1)                                               AS rate_pct
         FROM classes c
         JOIN enrollments e ON e.class_id  = c.id AND e.school_id = c.school_id AND e.status = 'active'
         JOIN students    s ON s.id = e.student_id AND s.status   = 'active'
         LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = CURDATE()
         WHERE c.school_id = ?
         GROUP BY c.id, c.name
         HAVING total >= 5 AND (present / total) < 0.60
         ORDER BY rate_pct ASC
         LIMIT 10`,
        [schoolId],
      ),

      // ── CASE 3: Late arrivals spike ───────────────────────────────────────
      conn.execute(
        `SELECT
           COUNT(*)                                                              AS late_total,
           COUNT(*) * 100.0 / NULLIF(
             (SELECT COUNT(*) FROM students WHERE school_id = ? AND status='active'),0) AS late_pct
         FROM student_attendance sa
         INNER JOIN students ss ON ss.id = sa.student_id AND ss.school_id = ?
         WHERE sa.date = CURDATE() AND sa.status = 'late'`,
        [schoolId, schoolId],
      ),

      // ── CASE 4: Students with outstanding fee balance ─────────────────────
      conn.execute(
        `SELECT
           COUNT(DISTINCT s.id)       AS debtor_count,
           SUM(sfi.balance)           AS total_outstanding,
           SUM(CASE WHEN sfi.balance > 0 THEN sfi.balance ELSE 0 END) AS overdue_balance
         FROM student_fee_items sfi
         JOIN students s ON s.id = sfi.student_id AND s.school_id = ? AND s.status = 'active'
         WHERE sfi.balance > 0`,
        [schoolId],
      ),

      // ── CASE 5+10: Dropout compound risk (low attendance AND high fees) ───
      // Attendance < 50% in last 14 days AND fee balance > 0
      conn.execute(
        `SELECT
           s.id                                                             AS student_id,
           CONCAT(p.first_name,' ',p.last_name)                            AS name,
           COALESCE(c.name,'Unknown Class')                                 AS class_name,
           SUM(COALESCE(sfi.balance,0))                                     AS fee_balance,
           SUM(CASE WHEN sa.status IN ('present','late') THEN 1 ELSE 0 END) AS present_14d,
           SUM(CASE WHEN sa.date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)    THEN 1 ELSE 0 END) AS total_14d
         FROM students s
         JOIN  people p   ON p.id = s.person_id
         LEFT JOIN enrollments  e   ON e.student_id = s.id AND e.school_id = s.school_id AND e.status='active'
         LEFT JOIN classes      c   ON c.id = e.class_id AND c.school_id = s.school_id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id
                                          AND sa.date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
         LEFT JOIN student_fee_items sfi ON sfi.student_id = s.id AND sfi.balance > 0
         WHERE s.school_id = ? AND s.status = 'active'
         GROUP BY s.id, p.first_name, p.last_name, c.name
         HAVING fee_balance > 0 AND total_14d > 0 AND (present_14d / total_14d) < 0.50
         ORDER BY fee_balance DESC, present_14d ASC
         LIMIT 30`,
        [schoolId],
      ),

      // ── CASE 6+7: Classes with high failure rate this term ───────────────
      conn.execute(
        `SELECT
           c.id                                                            AS class_id,
           c.name                                                          AS class_name,
           ROUND(AVG(cr.score),1)                                         AS average_marks,
           COUNT(CASE WHEN cr.score < 50 THEN 1 END)                      AS failed_students,
           COUNT(DISTINCT cr.student_id)                                  AS total_students,
           ROUND(COUNT(CASE WHEN cr.score < 50 THEN 1 END) * 100.0
                 / NULLIF(COUNT(DISTINCT cr.student_id),0),1)             AS failure_rate
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id AND s.school_id = ?
         JOIN classes  c ON c.id = cr.class_id   AND c.school_id = ?
         JOIN terms    t ON t.id = cr.term_id    AND t.school_id = ? AND t.status = 'active'
         WHERE cr.score IS NOT NULL
         GROUP BY c.id, c.name
         HAVING total_students > 0
           AND (failed_students * 1.0 / total_students) > 0.30
         ORDER BY failure_rate DESC
         LIMIT 10`,
        [schoolId, schoolId, schoolId],
      ),

      // ── CASE 8: Offline devices ───────────────────────────────────────────
      conn.execute(
        `SELECT id, device_name AS name, sn AS serial_number, last_seen, location
         FROM devices
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'
           AND (last_seen IS NULL OR last_seen <= DATE_SUB(NOW(), INTERVAL 5 MINUTE))
         ORDER BY last_seen ASC
         LIMIT 10`,
        [schoolId],
      ),

      // ── CASE 9: Unmatched ZK logs (last 7 days) ───────────────────────────
      conn.execute(
        `SELECT COUNT(*) AS unmatched
         FROM zk_attendance_logs
         WHERE school_id = ? AND matched = 0
           AND DATE(check_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        [schoolId],
      ),

      // ── Self-learning: fetch recently dismissed rec_keys (last 24h) ───────
      conn.execute(
        `SELECT rec_key, action_taken, created_at
         FROM recommendation_actions
         WHERE school_id = ?
           AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ORDER BY created_at DESC`,
        [schoolId],
      ).catch(() => [[]]),  // table may not exist yet — degrade gracefully
    ]);

    // ── Normalise raw results ─────────────────────────────────────────────
    const absent3d       = (prolongedAbsences[0]   as any[]);
    const lowClasses     = (lowClassAttendance[0]  as any[]);
    const lateRow        = (lateSpike[0]           as any[])[0] ?? {};
    const feeRow         = (feeDebtors[0]          as any[])[0] ?? {};
    const dropoutRisk    = (dropoutCompound[0]     as any[]);
    const failClasses    = (classDecline[0]         as any[]);
    const offlineDevices = (deviceOffline[0]       as any[]);
    const unmatchedRow   = (unmatchedLogs[0]       as any[])[0] ?? {};
    const dismissals     = (recentDismissals[0]    as any[]);

    // Build dismissed key set for suppression
    const dismissed = new Set(
      dismissals
        .filter((d: any) => d.action_taken === 'dismissed')
        .map((d: any) => String(d.rec_key))
    );

    const recs: Recommendation[] = [];

    // ── Recommendation 1: Prolonged absences ─────────────────────────────
    if (absent3d.length > 0 && !dismissed.has('prolonged_absence')) {
      recs.push({
        id:        'prolonged_absence',
        type:      'attendance',
        title:     `${absent3d.length} student${absent3d.length > 1 ? 's' : ''} missing for 3+ days`,
        description: `${absent3d.length} learner${absent3d.length > 1 ? 's have' : ' has'} been absent for 3 or more of the last 5 school days. Without intervention, these may become permanent dropouts.`,
        action:    `Call the parents of: ${absent3d.slice(0,3).map((s: any) => s.name).join(', ')}${absent3d.length > 3 ? ` and ${absent3d.length - 3} more` : ''}`,
        urgency:   'critical',
        affected_count: absent3d.length,
        affected_entities: absent3d.map((s: any) => ({
          id:    s.student_id,
          label: s.name,
          meta:  `${s.class_name}${s.phone ? ' · ' + s.phone : ''} · ${s.absent_count} absences`,
        })),
        action_url:             `/students?filter=absent_3d`,
        auto_action_available:  true,
        auto_action_label:      'Export Contact List',
      });
    }

    // ── Recommendation 2: Low-attendance classes ──────────────────────────
    for (const cls of lowClasses) {
      const key = `low_class_${cls.class_id}`;
      if (dismissed.has(key)) continue;
      recs.push({
        id:          key,
        type:        'attendance',
        title:       `${cls.class_name} — only ${cls.rate_pct ?? 0}% present today`,
        description: `Only ${n(cls.present)} out of ${n(cls.total)} students in ${cls.class_name} attended today. ${n(cls.absent_today)} are unaccounted for.`,
        action:      `Open ${cls.class_name} attendance register and identify absent learners`,
        urgency:     n(cls.rate_pct) < 40 ? 'critical' : 'high',
        affected_count: n(cls.absent_today),
        affected_entities: [{ id: cls.class_id, label: cls.class_name, meta: `${cls.rate_pct}% attendance` }],
        action_url:            `/attendance?class_id=${cls.class_id}&date=${new Date().toISOString().split('T')[0]}&status=absent`,
        auto_action_available: false,
      });
    }

    // ── Recommendation 3: Late arrivals spike ────────────────────────────
    const lateTotal = n(lateRow.late_total);
    const latePct   = n(lateRow.late_pct);
    if (lateTotal >= 10 && !dismissed.has('late_spike')) {
      recs.push({
        id:          'late_spike',
        type:        'attendance',
        title:       `${lateTotal} students arrived late today`,
        description: `${lateTotal} learners (${latePct.toFixed(1)}% of school) marked late today. Recurring late arrivals signal a systemic issue.`,
        action:      'Review arrival policy enforcement and communicate with class teachers',
        urgency:     latePct > 15 ? 'high' : 'medium',
        affected_count:    lateTotal,
        affected_entities: [{ id: 'late', label: `${lateTotal} late students`, meta: `${latePct.toFixed(1)}% of school` }],
        action_url:            `/attendance?date=${new Date().toISOString().split('T')[0]}&status=late`,
        auto_action_available: false,
      });
    }

    // ── Recommendation 4: Outstanding fees ───────────────────────────────
    const debtorCount      = n(feeRow.debtor_count);
    const totalOutstanding = n(feeRow.total_outstanding);
    if (debtorCount >= 5 && !dismissed.has('outstanding_fees')) {
      recs.push({
        id:          'outstanding_fees',
        type:        'fees',
        title:       `${debtorCount} students have unpaid balances`,
        description: `Total outstanding: ${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} UGX across ${debtorCount} learners. Initiate fee reminders before term end.`,
        action:      'Export debtor list and send fee reminders to parents',
        urgency:     debtorCount > 50 ? 'high' : 'medium',
        affected_count: debtorCount,
        affected_entities: [{ id: 'fees', label: `${debtorCount} debtors`, meta: `${totalOutstanding.toLocaleString()} UGX owed` }],
        action_url:            `/finance/fees?filter=outstanding`,
        auto_action_available: true,
        auto_action_label:     'Export Debtor List',
      });
    }

    // ── Recommendation 5+10: Dropout compound risk ───────────────────────
    if (dropoutRisk.length > 0 && !dismissed.has('dropout_risk')) {
      recs.push({
        id:          'dropout_risk',
        type:        'behavior',
        title:       `${dropoutRisk.length} students at HIGH dropout risk`,
        description: `These learners combine two danger signals: less than 50% attendance in the last 14 days AND an unpaid fee balance. Action now prevents silent drop-out.`,
        action:      'Contact these families immediately — offer fee support plan and follow up on absences',
        urgency:     'critical',
        affected_count: dropoutRisk.length,
        affected_entities: dropoutRisk.slice(0, 20).map((s: any) => ({
          id:    s.student_id,
          label: s.name,
          meta:  `${s.class_name} · ${Math.round(n(s.present_14d) / Math.max(n(s.total_14d),1) * 100)}% attendance · ${Number(s.fee_balance).toLocaleString()} UGX owed`,
        })),
        action_url:            `/students?filter=dropout_risk`,
        auto_action_available: true,
        auto_action_label:     'View Full Profiles',
      });
    }

    // ── Recommendation 6+7: High failure rate classes ────────────────────
    for (const cls of failClasses) {
      const key = `fail_class_${cls.class_id}`;
      if (dismissed.has(key)) continue;
      recs.push({
        id:          key,
        type:        'academic',
        title:       `${cls.failure_rate}% of ${cls.class_name} are failing`,
        description: `${n(cls.failed_students)} out of ${n(cls.total_students)} students in ${cls.class_name} are failing this term (average: ${Number(cls.average_marks).toFixed(1)}%). This may indicate a teaching or curriculum problem, not just student performance.`,
        action:      `Review ${cls.class_name} teaching methods, subject coverage, and exam format`,
        urgency:     n(cls.failure_rate) > 50 ? 'high' : 'medium',
        affected_count: n(cls.failed_students),
        affected_entities: [{ id: cls.class_id, label: cls.class_name, meta: `Avg: ${Number(cls.average_marks).toFixed(1)} · ${cls.failure_rate}% fail rate` }],
        action_url:            `/results?class_id=${cls.class_id}`,
        auto_action_available: false,
      });
    }

    // ── Recommendation 8: Offline devices ────────────────────────────────
    if (offlineDevices.length > 0 && !dismissed.has('device_offline')) {
      recs.push({
        id:          'device_offline',
        type:        'device',
        title:       `${offlineDevices.length} attendance device${offlineDevices.length > 1 ? 's are' : ' is'} offline`,
        description: `${offlineDevices.map((d: any) => d.name || d.serial_number || 'Unknown').join(', ')} ${offlineDevices.length > 1 ? 'have' : 'has'} not sent a heartbeat in over 5 minutes. Attendance data is NOT being recorded.`,
        action:      'Check device power and network. Restart device or notify IT.',
        urgency:     'high',
        affected_count: offlineDevices.length,
        affected_entities: offlineDevices.map((d: any) => ({
          id:    d.id,
          label: d.name || d.serial_number || `Device ${d.id}`,
          meta:  d.location ?? (d.last_seen ? `Last seen: ${new Date(d.last_seen).toLocaleTimeString()}` : 'Never connected'),
        })),
        action_url:            `/settings/devices`,
        auto_action_available: true,
        auto_action_label:     'Go to Device Manager',
      });
    }

    // ── Recommendation 9: Unmatched ZK logs ──────────────────────────────
    const unmatched = n(unmatchedRow.unmatched);
    if (unmatched > 0 && !dismissed.has('unmatched_logs')) {
      recs.push({
        id:          'unmatched_logs',
        type:        'device',
        title:       `${unmatched} attendance punches not linked to any student`,
        description: `${unmatched} biometric punch${unmatched > 1 ? 'es' : ''} in the last 7 days ${unmatched > 1 ? 'have' : 'has'} no matching student record. These learners are physically present but invisible in the system.`,
        action:      'Open the ZK User Mapping panel and resolve unmatched punches',
        urgency:     unmatched > 20 ? 'high' : 'medium',
        affected_count: unmatched,
        affected_entities: [{ id: 'unmatched', label: `${unmatched} unmatched punches`, meta: 'Last 7 days' }],
        action_url:            `/attendance/zk?tab=mapping`,
        auto_action_available: true,
        auto_action_label:     'Open Mapping UI',
      });
    }

    // ── Sort by urgency then affected count ───────────────────────────────
    recs.sort((a, b) => {
      const ud = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (ud !== 0) return ud;
      return b.affected_count - a.affected_count;
    });

    // ── Compute summary counts ────────────────────────────────────────────
    const summary = {
      critical: recs.filter(r => r.urgency === 'critical').length,
      high:     recs.filter(r => r.urgency === 'high').length,
      medium:   recs.filter(r => r.urgency === 'medium').length,
      low:      recs.filter(r => r.urgency === 'low').length,
      total:    recs.length,
    };

    return NextResponse.json({ success: true, data: { recommendations: recs, summary } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[recommendations] Error:', msg);
    return NextResponse.json({ error: 'Failed to generate recommendations', detail: msg }, { status: 500 });
  } finally {
    if (conn && typeof (conn as any).release === 'function') {
      (conn as any).release();
    }
  }
}
