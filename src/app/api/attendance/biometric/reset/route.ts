import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/attendance/biometric/reset
 * ────────────────────────────────────
 * "Reset biometric enrollments" — clears the CALLER'S school's biometric
 * identity BINDINGS so every device PIN becomes unmapped again. DRAIS
 * forgets who each PIN is; the physical device keeps its users until you
 * re-sync/re-enroll.
 *
 * Scope (mappings only — deliberately narrow):
 *   • biometric_enrollments  (canonical PIN→person bindings)
 *   • zk_user_mapping        (legacy mirror)
 *
 * Deliberately KEPT: devices, students/staff, attendance history, the
 * device_user_directory, captured templates, reconciliation history, and
 * the biometric_mapping_history audit trail (so this reset is itself
 * traceable).
 *
 * Guardrails: school-scoped, super-admin only, requires { confirm: true }.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Only an administrator can reset biometric enrollments.' },
      { status: 403 },
    );
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty → not confirmed */ }
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Confirmation required. Pass { "confirm": true }.' },
      { status: 400 },
    );
  }

  const { schoolId } = session;

  try {
    const cleared = await withTransaction(async (conn) => {
      const [enr] = await conn.execute(
        'DELETE FROM biometric_enrollments WHERE school_id = ?',
        [schoolId],
      );
      // Legacy mirror — best-effort (table may be gone post-cutover).
      let mappings = 0;
      try {
        const [zk] = await conn.execute(
          'DELETE FROM zk_user_mapping WHERE school_id = ?',
          [schoolId],
        );
        mappings = (zk as any).affectedRows ?? 0;
      } catch { /* legacy table absent — fine */ }
      return {
        enrollments: (enr as any).affectedRows ?? 0,
        mappings,
      };
    });

    await logAudit({
      schoolId,
      userId: session.userId,
      action: 'RESET_BIOMETRIC_ENROLLMENTS',
      entityType: 'biometric',
      entityId: schoolId,
      details: cleared,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
    }).catch(() => { /* audit best-effort */ });

    console.log(
      `[Biometric Reset] school=${schoolId} by user=${session.userId} (${session.email}) — ` +
      `enrollments=${cleared.enrollments} mappings=${cleared.mappings}`,
    );

    return NextResponse.json({
      success: true,
      cleared,
      message: cleared.enrollments > 0
        ? `Reset ${cleared.enrollments.toLocaleString()} biometric enrollment${cleared.enrollments === 1 ? '' : 's'}. Every PIN is now unmapped.`
        : 'No biometric enrollments to reset.',
    });
  } catch (err: any) {
    console.error('[Biometric Reset] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to reset biometric enrollments', details: err?.message },
      { status: 500 },
    );
  }
}
