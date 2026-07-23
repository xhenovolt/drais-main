/**
 * Founder Independence Layer (Phase 10 — capstone of the Intelligence
 * Program). A living before/after report: every attendance workflow that
 * once required the founder, what replaced that dependence, and the DRAIS
 * surface a trained administrator now uses instead.
 *
 * The baseline column is the Phase 0 audit truth
 * (docs/audits/ATTENDANCE_ARCHITECTURE_AUDIT.md, §8). The "now" column and
 * score are computed from that mapping; buildReport() layers in a few LIVE
 * signals so the page reflects the actual school, not just a static claim.
 */
import { query } from '@/lib/db';

export type Autonomy = 'founder' | 'manual' | 'assisted' | 'automated';

export interface WorkflowRow {
  key: string;
  workflow: string;
  before: Autonomy;
  after: Autonomy;
  surface: string;            // the route/feature that handles it now
  phase: string;              // which program phase delivered it
  live?: string;              // optional live evidence for this school
}

const AUTONOMY_WEIGHT: Record<Autonomy, number> = { founder: 0, manual: 40, assisted: 75, automated: 100 };

/** The workflow map — Phase 0 baseline → current state. */
export const WORKFLOWS: WorkflowRow[] = [
  { key: 'clock_drift', workflow: 'Detect & correct device clock drift', before: 'founder', after: 'automated',
    surface: 'Time Intelligence + self-feeding sweep', phase: 'Phase 4 / 1.89.1' },
  { key: 'attendance_stopped', workflow: 'Notice attendance stopped & recover it', before: 'founder', after: 'assisted',
    surface: 'Recovery Center (gap detection + routed recovery)', phase: 'Phase 5' },
  { key: 'identity_mapping', workflow: 'Map device users to people', before: 'manual', after: 'assisted',
    surface: 'Identity Matching + Detect & map', phase: 'pre-program' },
  { key: 'identity_health', workflow: 'Find duplicate / unknown / stale mappings', before: 'founder', after: 'assisted',
    surface: 'Identity Intelligence', phase: 'Phase 8' },
  { key: 'sms_diagnosis', workflow: 'Diagnose SMS failures', before: 'founder', after: 'automated',
    surface: 'Health Center + queue retry', phase: 'Phase 1' },
  { key: 'why_late', workflow: 'Explain why a verdict is late/absent', before: 'founder', after: 'automated',
    surface: 'Explanation Engine ("Why?" on every row)', phase: 'Phase 9' },
  { key: 'trust_a_record', workflow: 'Judge whether a single record is trustworthy', before: 'founder', after: 'automated',
    surface: 'Per-record confidence chips', phase: 'Phase 3' },
  { key: 'where_broke', workflow: 'Trace where a punch failed in the pipeline', before: 'founder', after: 'automated',
    surface: 'Digital Twin / Event Explorer', phase: 'Phase 2' },
  { key: 'device_maintenance', workflow: 'Decide which device needs maintenance', before: 'founder', after: 'automated',
    surface: 'Device Intelligence (reputation + advice)', phase: 'Phase 7' },
  { key: 'attendance_trends', workflow: 'Spot lateness / absence trends', before: 'founder', after: 'automated',
    surface: 'Attendance Trends (pattern analytics)', phase: 'Phase 6' },
  { key: 'is_it_healthy', workflow: 'Answer "is attendance OK right now?"', before: 'founder', after: 'automated',
    surface: 'Health Center (overall score + checks)', phase: 'Phase 1' },
  { key: 'bulk_recovery', workflow: 'Backfill missed days from the device', before: 'founder', after: 'assisted',
    surface: 'Device Control wizard (routed from Recovery)', phase: 'pre-program' },
  { key: 'version_history', workflow: 'Know what version runs & what changed', before: 'founder', after: 'automated',
    surface: 'About / System Information', phase: 'v1.83' },
  { key: 'platform_ops', workflow: 'Operate schools without their credentials', before: 'founder', after: 'assisted',
    surface: 'Control Center', phase: 'v1.84' },
];

export function scoreIndependence(rows: WorkflowRow[]): { before: number; after: number; delta: number } {
  const b = Math.round(rows.reduce((a, r) => a + AUTONOMY_WEIGHT[r.before], 0) / rows.length);
  const a = Math.round(rows.reduce((x, r) => x + AUTONOMY_WEIGHT[r.after], 0) / rows.length);
  return { before: b, after: a, delta: a - b };
}

export async function buildReport(schoolId: number) {
  const rows: WorkflowRow[] = WORKFLOWS.map(r => ({ ...r }));
  const one = async (sql: string, params: any[]) => ((await query(sql, params).catch(() => [])) as any[])[0] || null;

  // A few LIVE signals so the report reflects this school specifically.
  try {
    const [clock, unmatched, baselines] = await Promise.all([
      one(`SELECT COUNT(*) tracked, SUM(status='anomaly') bad FROM device_clock_health WHERE school_id=? AND local_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY)`, [schoolId]),
      one(`SELECT COUNT(*) n FROM attendance_raw_events WHERE school_id=? AND (matched=0 OR person_id IS NULL) AND punch_at>=DATE_SUB(NOW(),INTERVAL 7 DAY)`, [schoolId]),
      one(`SELECT COUNT(*) n FROM attendance_time_baselines WHERE school_id=?`, [schoolId]),
    ]);
    const set = (key: string, live: string) => { const r = rows.find(x => x.key === key); if (r) r.live = live; };
    if (clock) set('clock_drift', `${Number(clock.bad || 0)} drift day(s) auto-detected in 30; baseline ${Number(baselines?.n || 0) > 0 ? 'learned' : 'pending'}`);
    if (unmatched) set('identity_health', `${Number(unmatched.n || 0)} unmatched punch(es) flagged (7d)`);
  } catch { /* live signals are a bonus */ }

  return { rows, score: scoreIndependence(rows), generated_at: new Date().toISOString() };
}
