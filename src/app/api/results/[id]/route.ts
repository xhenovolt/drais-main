import { NextResponse, NextRequest } from "next/server";
import { getConnection } from "@/lib/db";
import { getSessionSchoolId } from "@/lib/auth";

/**
 * SECURITY: PHASE 2A & 2B FIX - Multi-tenant Isolation with Direct school_id
 * PUT /api/results/[id]
 * 
 * Updates exam result with enforced school_id filtering:
 * 1. Requires authentication (session.schoolId)
 * 2. Validates result belongs to user's school (direct school_id column)
 * 3. Uses indexed school_id filter for performance
 * 4. Prevents cross-school result modification
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // SECURITY: Check authentication first
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const resolvedParams = await params;
  const id = parseInt(resolvedParams.id, 10);
  const body = await req.json();

  if (!id || !body.score) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  let conn;
  try {
    conn = await getConnection();
    
    // SECURITY: Verify result belongs to user's school (direct school_id column - fast & safe)
    const [resultCheck]: any = await conn.execute(`
      SELECT r.id FROM results r
      WHERE r.id = ? AND r.school_id = ?
    `, [id, session.schoolId]);

    if (!resultCheck || resultCheck.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Result not found or access denied" 
      }, { status: 403 });
    }

    // SECURITY: Update with direct school_id filter
    await conn.execute(
      `UPDATE results SET score = ?, grade = ?, remarks = ? 
       WHERE id = ? AND school_id = ?`,
      [parseFloat(body.score), body.grade || null, body.remarks || null, id, session.schoolId]
    );

    // SECURITY: Fetch back with school_id validation
    const [rows]: any = await conn.execute(`
      SELECT r.* FROM results r
      WHERE r.id = ? AND r.school_id = ?
    `, [id, session.schoolId]);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Failed to update result" 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, updatedResult: rows[0] });
  } catch (error) {
    console.error("Error updating result:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to update result" 
    }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
