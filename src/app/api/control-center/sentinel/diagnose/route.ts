/**
 * Control Center — Full System Diagnosis.
 *   POST → runs the diagnosis engine NOW, persists it to sentinel_diagnostics,
 *          returns the full report. This is the DEEP, explicitly-triggered
 *          operation — never run on a schedule or per-request.
 *   GET  → historical reports (summary list), newest first.
 * Triggering requires sentinel.manage; reading history is open to any
 * control session (matches the codebase's read/mutate split convention).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { query } from '@/lib/db';
import { ensureSentinelSchema } from '@/lib/sentinel/schema';
import { runFullSystemDiagnosis } from '@/lib/sentinel/diagnosis/engine';

export const runtime = 'nodejs';

function liveCommitSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? null;
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sentinel.manage')) {
    return NextResponse.json({ error: 'You do not have permission to trigger a Full System Diagnosis' }, { status: 403 });
  }

  const report = await runFullSystemDiagnosis(liveCommitSha());

  await ensureSentinelSchema();
  const result = (await query(
    `INSERT INTO sentinel_diagnostics (triggered_by, trigger_source, overall_score, readiness, commit_sha, sentinel_version, engine_version, report)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?)`,
    [user.id, report.overallScore, report.readiness, report.meta.liveCommitSha, report.meta.sentinelVersion, report.meta.engineVersion, JSON.stringify(report)],
  ).catch(() => null)) as { insertId?: number } | null;

  await controlAudit(user.id, 'sentinel_full_diagnosis', result?.insertId ? `sentinel_diagnostics:${result.insertId}` : 'sentinel_diagnostics', { score: report.overallScore, readiness: report.readiness }, clientIp(req)).catch(() => {});

  return NextResponse.json({ success: true, id: result?.insertId ?? null, report });
}

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await ensureSentinelSchema();
  const rows = (await query(
    `SELECT id, triggered_by, trigger_source, overall_score, readiness, commit_sha, sentinel_version, engine_version, created_at
       FROM sentinel_diagnostics ORDER BY id DESC LIMIT 30`,
  ).catch(() => [])) as any[];
  return NextResponse.json({ success: true, reports: rows });
}
