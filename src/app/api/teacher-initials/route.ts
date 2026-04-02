import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ok, fail } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return fail('Not authenticated', 401);

  const rows = await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'teacher_initials'`,
    [session.schoolId]
  );

  const initials = rows[0]?.value_text ? JSON.parse(rows[0].value_text) : {};
  return ok('Teacher initials fetched', initials);
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return fail('Not authenticated', 401);

  const { classId, subjectId, initials } = await req.json();
  if (!classId || !subjectId || !initials) {
    return fail('classId, subjectId, and initials are required');
  }

  // Load existing initials
  const rows = await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'teacher_initials'`,
    [session.schoolId]
  );

  const existing = rows[0]?.value_text ? JSON.parse(rows[0].value_text) : {};
  existing[`${classId}-${subjectId}`] = initials;

  if (rows.length > 0) {
    await query(
      `UPDATE school_settings SET value_text = ? WHERE school_id = ? AND key_name = 'teacher_initials'`,
      [JSON.stringify(existing), session.schoolId]
    );
  } else {
    await query(
      `INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'teacher_initials', ?)`,
      [session.schoolId, JSON.stringify(existing)]
    );
  }

  return ok('Initials saved');
}
