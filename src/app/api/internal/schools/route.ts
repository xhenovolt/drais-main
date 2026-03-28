/**
 * GET /api/internal/schools
 *
 * Returns all schools with id, external_id, name, status, created_at.
 * Used by JETON for school listing and monitoring.
 *
 * Auth: x-api-key header (JETON_API_KEY)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/verifyInternalRequest';

export async function GET(request: NextRequest) {
  const authError = verifyInternalRequest(request);
  if (authError) return authError;

  try {
    const schools = await query(
      `SELECT
         id,
         external_id,
         name,
         email,
         phone,
         status,
         created_at,
         updated_at
       FROM schools
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    console.log(`[InternalAPI] GET /schools → ${schools.length} schools returned`);

    return NextResponse.json({ success: true, data: schools });
  } catch (error: any) {
    console.error('[InternalAPI] GET /schools error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to fetch schools', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }
}
