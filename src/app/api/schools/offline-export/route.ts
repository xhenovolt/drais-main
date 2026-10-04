/**
 * POST /api/schools/offline-export — self-service lean .drs generation.
 * Phase 7 sub-effort 23 (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md).
 *
 * SECURITY, non-negotiable: the school being exported is ALWAYS
 * session.schoolId, derived server-side from the authenticated session via
 * getSessionSchoolId() — this route never reads a school id from the
 * request body, query string, or any client-supplied value. There is no
 * code path here through which a logged-in Albayan user could export
 * Nakifuma's data by editing the request: nothing in this handler ever
 * looks at anything the client could set to choose which school.
 *
 * Runs the real, already-validated engine (src/lib/provisioning/
 * export-drs.ts's exportSchoolToDrs(), the same code the founder CLI tool
 * uses) and streams the resulting .drs bytes back as a file download —
 * no separate job/poll state, no partial progress persisted anywhere.
 * Known, named limitation: this blocks for the export's full duration
 * (observed ~3-6 minutes for a ~800-student school against live TiDB).
 * If this deployment's request timeout is shorter than that, the honest
 * next step is converting this to backup_records' resumable per-table
 * stepping protocol (src/lib/backup/orchestrator.ts) — not attempted here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await requirePermission(session.userId, session.schoolId, 'settings.offline_export', session.isSuperAdmin);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Forbidden' }, { status: err.statusCode || 403 });
  }

  let body: { passphrase?: string } = {};
  try { body = await request.json(); } catch { /* empty */ }
  const passphrase = body.passphrase;
  if (!passphrase || passphrase.length < 8) {
    return NextResponse.json({ error: 'A passphrase of at least 8 characters is required to encrypt the offline database.' }, { status: 400 });
  }

  try {
    const { exportSchoolToDrs } = await import('@/lib/provisioning/export-drs');
    // The school id below is session-derived only — see this file's header.
    // Nothing from the client's request ever supplies it.
    const result = await exportSchoolToDrs({ schoolId: session.schoolId, passphrase });

    void logAudit({
      schoolId: session.schoolId, userId: session.userId, action: AuditAction.EXPORTED_OFFLINE_DATABASE,
      entityType: 'offline_export', entityId: session.schoolId,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent'),
    });

    return new NextResponse(result.drsBuffer, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${result.fileNameSafe}.drs"`,
        'x-drais-export-total-rows': String(result.totalRows),
        'x-drais-export-generated-at': result.generatedAt,
      },
    });
  } catch (err) {
    console.error('[offline-export] FAILED:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Offline database generation failed' },
      { status: 500 },
    );
  }
}
