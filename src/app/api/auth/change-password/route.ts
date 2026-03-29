import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * PATCH /api/auth/change-password
 * Sets a new password for the currently logged-in user.
 * Used by: normal password change AND forced first-login password change.
 */
export async function PATCH(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { current_password?: string; new_password: string; confirm_password: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { current_password, new_password, confirm_password } = body;

  if (!new_password || !confirm_password) {
    return NextResponse.json({ error: 'new_password and confirm_password are required' }, { status: 400 });
  }

  if (new_password !== confirm_password) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
  }

  if (new_password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Fetch user
  const users = await query(
    `SELECT id, password_hash, must_change_password FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [session.userId]
  ) as any[];

  if (!users?.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const user = users[0];
  const isForcedReset = !!user.must_change_password;

  // If not a forced reset, require current_password verification
  if (!isForcedReset) {
    if (!current_password) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
    }
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
    }
  }

  const hash = await bcrypt.hash(new_password, 12);

  await query(
    `UPDATE users SET password_hash = ?, must_change_password = FALSE, updated_at = NOW() WHERE id = ?`,
    [hash, session.userId]
  );

  const response = NextResponse.json({ success: true });

  // Clear the force-reset cookie
  response.cookies.set('drais_force_reset', '', {
    httpOnly: false,
    path: '/',
    maxAge: 0,
  });

  return response;
}
