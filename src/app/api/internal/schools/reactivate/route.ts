/**
 * POST /api/internal/schools/reactivate
 *
 * Reactivates a suspended school, restoring full access.
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

    if (school.status === 'active') {
      return NextResponse.json({
        success: true,
        message: 'School is already active',
        data: { id: school.id, external_id, status: 'active' },
      });
    }

    await query(
      `UPDATE schools SET status = 'active', updated_at = NOW() WHERE external_id = ?`,
      [external_id]
    );

    console.log(`[InternalAPI] REACTIVATE school #${school.id} "${school.name}" (was: ${school.status})`);

    return NextResponse.json({
      success: true,
      message: `School "${school.name}" reactivated successfully`,
      data: { id: school.id, external_id, status: 'active' },
    });
  } catch (error: any) {
    console.error('[InternalAPI] POST /schools/reactivate error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to reactivate school', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }
}
