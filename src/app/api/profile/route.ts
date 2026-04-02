import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import bcrypt from 'bcryptjs';

/**
 * GET /api/profile — get current user's profile
 * PUT /api/profile — update current user's profile fields
 */

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    connection = await getConnection();
    const [rows]: any = await connection.execute(
      `SELECT u.id, u.username, u.email, u.phone, u.role, u.profile_photo, u.preferences,
              p.first_name, p.last_name
       FROM users u
       LEFT JOIN people p ON p.id = u.person_id
       WHERE u.id = ? AND u.school_id = ?`,
      [session.userId, session.schoolId]
    );

    if (!rows.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = rows[0];
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePhoto: user.profile_photo,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        preferences: user.preferences ? (typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences) : {},
      },
    });
  } catch (error: any) {
    console.error('[profile GET]', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { firstName, lastName, email, phone, profilePhoto, currentPassword, newPassword } = body;

    connection = await getConnection();

    // If password change requested, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
      }

      const [userRows]: any = await connection.execute(
        'SELECT password_hash FROM users WHERE id = ? AND school_id = ?',
        [session.userId, session.schoolId]
      );
      if (!userRows.length) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const valid = await bcrypt.compare(currentPassword, userRows[0].password_hash);
      if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
      }

      const hash = await bcrypt.hash(newPassword, 12);
      await connection.execute(
        'UPDATE users SET password_hash = ? WHERE id = ? AND school_id = ?',
        [hash, session.userId, session.schoolId]
      );
    }

    // Update user fields
    await connection.execute(
      `UPDATE users SET
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         profile_photo = COALESCE(?, profile_photo),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND school_id = ?`,
      [email || null, phone || null, profilePhoto || null, session.userId, session.schoolId]
    );

    // Update person name if person_id exists
    if (firstName || lastName) {
      await connection.execute(
        `UPDATE people p
         JOIN users u ON u.person_id = p.id
         SET p.first_name = COALESCE(?, p.first_name),
             p.last_name = COALESCE(?, p.last_name)
         WHERE u.id = ? AND u.school_id = ?`,
        [firstName || null, lastName || null, session.userId, session.schoolId]
      );
    }

    return NextResponse.json({ success: true, message: 'Profile updated' });
  } catch (error: any) {
    console.error('[profile PUT]', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
