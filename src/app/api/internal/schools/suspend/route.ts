/**
 * POST /api/internal/schools/suspend
 *
 * Suspends a school identified by external_id.
 * Suspended schools are blocked from login and all protected API routes.
 *
 * Body: { "external_id": "..." }
 * Auth: x-api-key header (JETON_API_KEY)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/verifyInternalRequest';

export async function POST(request: NextRequest) {
  const authError = verifyInternalRequest(request);
  if (authError) return authError;

  let body: { external_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  const { external_id } = body;

  if (!external_id || typeof external_id !== 'string' || external_id.trim() === '') {
    return NextResponse.json(
      { success: false, error: { message: 'external_id is required', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  try {
    // Fetch school first to verify it exists
    const schools = await query(
      `SELECT id, name, status FROM schools WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
      [external_id]
    );

    if (!schools || schools.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: 'School not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const school = schools[0];

    if (school.status === 'suspended') {
      return NextResponse.json({
        success: true,
        message: 'School is already suspended',
        data: { id: school.id, external_id, status: 'suspended' },
      });
    }

    await query(
      `UPDATE schools SET status = 'suspended', updated_at = NOW() WHERE external_id = ?`,
      [external_id]
    );

    console.log(`[InternalAPI] SUSPEND school #${school.id} "${school.name}" (was: ${school.status})`);

    return NextResponse.json({
      success: true,
      message: `School "${school.name}" suspended successfully`,
      data: { id: school.id, external_id, status: 'suspended' },
    });
  } catch (error: any) {
    console.error('[InternalAPI] POST /schools/suspend error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to suspend school', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }
}
