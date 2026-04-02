import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ok, fail } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return fail('Not authenticated', 401);

  const rows = await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'next_term_begins'`,
    [session.schoolId]
  );

  return ok('Next term date fetched', { nextTermBegins: rows[0]?.value_text || '' });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return fail('Not authenticated', 401);

  const { nextTermBegins } = await req.json();
  if (!nextTermBegins) return fail('nextTermBegins is required');

  const rows = await query(
    `SELECT id FROM school_settings WHERE school_id = ? AND key_name = 'next_term_begins'`,
    [session.schoolId]
  );

  if (rows.length > 0) {
    await query(
      `UPDATE school_settings SET value_text = ? WHERE school_id = ? AND key_name = 'next_term_begins'`,
      [nextTermBegins, session.schoolId]
    );
  } else {
    await query(
      `INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'next_term_begins', ?)`,
      [session.schoolId, nextTermBegins]
    );
  }

  return ok('Next term date saved');
}
