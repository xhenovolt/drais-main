/**
 * Proactive Attendance Digest (Founder-Independence Phase D).
 *
 * All the attendance intelligence is pull/banner — it waits to be looked at.
 * If nobody opens DRAIS, a dying device or a drifting clock goes unactioned.
 * This turns "DRAIS notices" into "DRAIS tells you": once a day it composes a
 * short digest of what needs the administrator and delivers it as an in-app
 * notification (cost-free, always available) to each school's admins.
 *
 * buildAttendanceDigest() is PURE and unit-tested — it turns the intelligence
 * summary into a prioritised, plain-language digest. sendDailyDigests()
 * delivers it (deduped once per school per day), triggered by the daily cron.
 *
 * Mode is per-school (school_settings 'attendance.digest_mode'):
 *   issues_only (default) — only send on a day with something to act on
 *   daily                 — always send (incl. an all-clear)
 *   off                   — never send
 */
import { query } from '@/lib/db';

export interface DigestInput {
  health: { score: number; status: string; topRec: string | null } | null;
  clock: { anomalies: number } | null;
  gaps: { gaps: number } | null;
  people: { watch: number; roster: number } | null;
  identity: { duplicates: number; unknowns: number } | null;
  devices: { needMaint: number } | null;
}

export interface DigestItem { text: string; route: string; severity: 'alert' | 'watch' | 'info'; }
export interface Digest {
  hasIssues: boolean;
  priority: 'high' | 'normal' | 'low';
  title: string;
  message: string;
  items: DigestItem[];
}

/** PURE: intelligence summary → prioritised digest. */
export function buildAttendanceDigest(s: DigestInput): Digest {
  const items: DigestItem[] = [];
  const add = (cond: boolean, text: string, route: string, severity: DigestItem['severity']) => { if (cond) items.push({ text, route, severity }); };

  // Null-safe counts first (arg text is evaluated eagerly regardless of cond).
  const gaps = s.gaps?.gaps ?? 0;
  const anomalies = s.clock?.anomalies ?? 0;
  const idIssues = (s.identity?.duplicates ?? 0) + (s.identity?.unknowns ?? 0);
  const maint = s.devices?.needMaint ?? 0;
  const watch = s.people?.watch ?? 0;
  const roster = s.people?.roster ?? 0;

  add(gaps > 0, `${gaps} attendance gap${gaps === 1 ? '' : 's'} — a device may have stopped uploading`, '/attendance/recovery', 'alert');
  add(anomalies > 0, `${anomalies} device clock${anomalies === 1 ? '' : 's'} drifting — today's times may be wrong`, '/attendance/time-health', 'alert');
  add(idIssues > 0, `${idIssues} identity issue${idIssues === 1 ? '' : 's'} (duplicate / unknown fingerprints)`, '/attendance/identity-intelligence', 'watch');
  add(maint > 0, `${maint} device${maint === 1 ? '' : 's'} need maintenance`, '/attendance/device-intelligence', 'watch');
  add(watch > 0, `${watch} ${watch === 1 ? 'person needs' : 'people need'} attention (absence / lateness)`, '/attendance/profiles', 'watch');
  add(roster > 0, `${roster} roster entr${roster === 1 ? 'y' : 'ies'} to review (never present — likely former/unenrolled)`, '/attendance/profiles', 'info');

  const hasAlert = items.some(i => i.severity === 'alert');
  const hasWatch = items.some(i => i.severity === 'watch');
  const hasIssues = items.length > 0;
  const priority: Digest['priority'] = hasAlert ? 'high' : hasWatch ? 'normal' : 'low';

  const healthLine = s.health ? `Attendance health ${s.health.score}% (${s.health.status}).` : '';
  const title = !hasIssues
    ? 'Attendance is healthy today'
    : hasAlert ? 'Attendance needs your attention' : 'A few attendance items to review';
  const message = !hasIssues
    ? `${healthLine} Nothing needs action today.`.trim()
    : `${healthLine} ${items.length} item${items.length === 1 ? '' : 's'} to act on:\n` + items.map(i => `• ${i.text}`).join('\n');

  return { hasIssues, priority, title, message, items };
}

/** Resolve a school's admin user ids (school-scoped, active). */
async function schoolAdmins(schoolId: number): Promise<number[]> {
  const rows = (await query(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE u.school_id = ? AND (u.status IS NULL OR u.status = 'active')
        AND (r.name LIKE '%dmin%' OR r.name LIKE '%eadteacher%' OR r.name LIKE '%irector%')`,
    [schoolId],
  ).catch(() => [])) as Array<{ id: number }>;
  return rows.map(r => Number(r.id));
}

async function digestMode(schoolId: number): Promise<'issues_only' | 'daily' | 'off'> {
  const rows = (await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'attendance.digest_mode' LIMIT 1`,
    [schoolId],
  ).catch(() => [])) as any[];
  const v = rows[0]?.value_text;
  return v === 'daily' || v === 'off' ? v : 'issues_only';
}

/** Already sent a digest for this school today? (dedup) */
async function sentToday(schoolId: number): Promise<boolean> {
  const rows = (await query(
    `SELECT 1 FROM notifications WHERE school_id = ? AND action = 'attendance_digest' AND DATE(created_at) = CURDATE() LIMIT 1`,
    [schoolId],
  ).catch(() => [])) as any[];
  return rows.length > 0;
}

/** Cron entry — compose + deliver a digest for every active school. */
export async function sendDailyDigests(): Promise<{ schools: number; sent: number }> {
  const schools = (await query(
    `SELECT DISTINCT school_id FROM attendance_raw_events
      WHERE punch_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND school_id IS NOT NULL`,
    [],
  ).catch(() => [])) as Array<{ school_id: number }>;

  let sent = 0;
  for (const row of schools) {
    const schoolId = Number(row.school_id);
    try {
      const mode = await digestMode(schoolId);
      if (mode === 'off') continue;
      if (await sentToday(schoolId)) continue;

      const summary = await buildSummary(schoolId);
      const digest = buildAttendanceDigest(summary);
      if (!digest.hasIssues && mode !== 'daily') continue; // issues_only: skip all-clear

      const admins = await schoolAdmins(schoolId);
      if (!admins.length) continue;

      const { NotificationService } = await import('@/lib/NotificationService');
      await NotificationService.getInstance().create({
        school_id: schoolId, action: 'attendance_digest', entity_type: 'attendance', entity_id: null,
        title: digest.title, message: digest.message,
        priority: digest.priority, channel: 'in_app',
        recipients: admins,
        metadata: { items: digest.items },
      } as any);
      sent++;
    } catch { /* per-school best-effort */ }
  }
  return { schools: schools.length, sent };
}

/** Gather the intelligence summary for a school (best-effort per layer). */
async function buildSummary(schoolId: number): Promise<DigestInput> {
  const safe = async <T>(fn: () => Promise<T>, fb: T): Promise<T> => { try { return await fn(); } catch { return fb; } };
  const [health, clock, gaps, people, identity, devices] = await Promise.all([
    safe(async () => { const { runHealthChecks } = await import('@/lib/attendance/health'); const r = await runHealthChecks(schoolId); return { score: r.score, status: r.status, topRec: r.recommendations[0] || null }; }, null),
    safe(async () => { const { sweepToday } = await import('@/lib/attendance/time-intelligence/engine'); const t = await sweepToday(schoolId); return { anomalies: t.filter((x: any) => x.status === 'anomaly').length }; }, null),
    safe(async () => { const { detectGaps } = await import('@/lib/attendance/recovery'); const r = await detectGaps(schoolId); return { gaps: r.summary.gaps }; }, null),
    safe(async () => {
      const { profilePerson } = await import('@/lib/attendance/person-intelligence');
      const rows = (await query(`SELECT r.person_id, r.attendance_date AS date, r.status FROM attendance_records r WHERE r.school_id = ? AND r.role_type='staff' AND r.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY r.person_id, r.attendance_date`, [schoolId])) as any[];
      const by = new Map<number, any[]>(); for (const r of rows) { if (!by.has(r.person_id)) by.set(r.person_id, []); by.get(r.person_id)!.push({ date: String(r.date).slice(0, 10), status: r.status }); }
      let watch = 0, roster = 0; for (const d of by.values()) { const p = profilePerson(d); if (p.watch) watch++; if (p.rosterReview) roster++; }
      return { watch, roster };
    }, null),
    safe(async () => {
      const dup = (await query(`SELECT COUNT(*) n FROM (SELECT 1 FROM biometric_enrollments WHERE school_id=? AND status IN ('active','pending_capture') GROUP BY role_type, role_ref_id HAVING COUNT(*)>1) x`, [schoolId])) as any[];
      const unk = (await query(`SELECT COUNT(DISTINCT device_user_id) n FROM attendance_raw_events WHERE school_id=? AND (matched=0 OR person_id IS NULL) AND punch_at>=DATE_SUB(NOW(),INTERVAL 7 DAY)`, [schoolId])) as any[];
      return { duplicates: Number(dup[0]?.n || 0), unknowns: Number(unk[0]?.n || 0) };
    }, null),
    safe(async () => { const { loadDeviceReputations } = await import('@/lib/attendance/device-intelligence-loader'); const d = await loadDeviceReputations(schoolId); return { needMaint: d.filter((x: any) => x.reputation.band === 'poor').length }; }, null),
  ]);
  return { health, clock, gaps, people, identity, devices };
}
