/**
 * GET /api/admin/hierarchy — org hierarchy tree for this school
 *
 * Returns a nested tree structure:
 *   [ { ...staff, children: [ ...staff ] }, ... ]
 *
 * Permission: staff.read
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';

interface StaffNode {
  id:            number;
  staff_no:      string;
  first_name:    string;
  last_name:     string;
  position:      string | null;
  department:    string | null;
  status:        string;
  photo_url:     string | null;
  manager_id:    number | null;
  children:      StaffNode[];
}

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'staff.read', session.isSuperAdmin);

  const rows = await query(
    `SELECT
       s.id,
       s.staff_no,
       s.position,
       s.status,
       s.manager_id,
       p.first_name,
       p.last_name,
       p.photo_url,
       d.name AS department
     FROM staff s
     JOIN people p ON s.person_id = p.id
     LEFT JOIN departments d ON s.department_id = d.id
     WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.status != 'terminated'
     ORDER BY p.first_name, p.last_name`,
    [session.schoolId],
  );

  // Build tree from flat list
  const map   = new Map<number, StaffNode>();
  const roots: StaffNode[] = [];

  for (const r of rows as any[]) {
    map.set(r.id, { ...r, children: [] });
  }

  for (const node of map.values()) {
    if (node.manager_id && map.has(node.manager_id)) {
      map.get(node.manager_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return NextResponse.json({ tree: roots, total: map.size });
});
