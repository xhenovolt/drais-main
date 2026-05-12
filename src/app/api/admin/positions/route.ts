import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { listPositions, type PositionCategory } from '@/lib/positions';

const VALID_CATEGORIES: PositionCategory[] = [
  'academic', 'admin', 'finance', 'support', 'spiritual',
];

/**
 * GET /api/admin/positions — list positions available to the caller's
 * school (global catalog + school-authored customs). Used by the staff
 * form's position dropdown.
 *
 * Query params:
 *   category?       filter to one of academic|admin|finance|support|spiritual
 *   active_only=0   include inactive rows (default: active only)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const categoryRaw = sp.get('category');
  const activeOnlyRaw = sp.get('active_only');

  let category: PositionCategory | undefined;
  if (categoryRaw !== null) {
    if (!VALID_CATEGORIES.includes(categoryRaw as PositionCategory)) {
      return NextResponse.json(
        { error: `Invalid category. Expected one of ${VALID_CATEGORIES.join('|')}` },
        { status: 400 },
      );
    }
    category = categoryRaw as PositionCategory;
  }

  const positions = await listPositions({
    schoolId:   session.schoolId,
    activeOnly: activeOnlyRaw !== '0',
    category,
  });
  return NextResponse.json({ success: true, positions });
}
