/**
 * Control Center — a single historical Full System Diagnosis report.
 * GET → machine-readable JSON (the report was stored as JSON; this route
 * simply returns it, so it doubles as the "machine-readable JSON" export
 * the spec requires — the browser handles printable/PDF via window.print()
 * on the on-screen render, no server-side PDF generation needed for v1).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { query } from '@/lib/db';
import { ensureSentinelSchema } from '@/lib/sentinel/schema';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  await ensureSentinelSchema();
  const rows = (await query(`SELECT * FROM sentinel_diagnostics WHERE id = ? LIMIT 1`, [Number(id)]).catch(() => [])) as any[];
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let report;
  try { report = typeof row.report === 'string' ? JSON.parse(row.report) : row.report; } catch { report = null; }

  return NextResponse.json({
    success: true,
    id: row.id, created_at: row.created_at, commit_sha: row.commit_sha,
    sentinel_version: row.sentinel_version, engine_version: row.engine_version,
    overall_score: row.overall_score, readiness: row.readiness,
    report,
  });
}
