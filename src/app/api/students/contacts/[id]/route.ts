import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getDbMode } from '@/lib/db/db-mode';

/** local-sqlite branches — Phase 7 sub-effort 29, same pattern as the
 *  parent route.ts's GET/POST branches. */
async function offlinePutContact(contactId: string, body: any) {
  const { contact_first_name = '', contact_last_name = '', contact_phone, contact_email = '', contact_address = '', relationship = '', occupation = '', alive_status = 'alive' } = body;
  if (!contact_phone) {
    return NextResponse.json({ success: false, error: 'Phone number is required' }, { status: 400 });
  }
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const db = getSqliteDb();
  const contact = db.prepare('SELECT person_id FROM contacts WHERE id = ?').get(contactId) as { person_id: number } | undefined;
  if (!contact) return NextResponse.json({ success: false, error: 'Contact not found' }, { status: 404 });
  const now = new Date().toISOString();
  const update = db.transaction(() => {
    db.prepare(`UPDATE people SET first_name = ?, last_name = ?, phone = ?, email = ?, address = ?, updated_at = ? WHERE id = ?`)
      .run(contact_first_name, contact_last_name, contact_phone, contact_email, contact_address, now, contact.person_id);
    db.prepare(`UPDATE contacts SET occupation = ?, alive_status = ? WHERE id = ?`).run(occupation, alive_status, contactId);
    if (relationship) db.prepare(`UPDATE student_contacts SET relationship = ? WHERE contact_id = ?`).run(relationship, contactId);
  });
  update();
  return NextResponse.json({ success: true, message: 'Contact updated successfully', data: { contact_id: contactId } });
}

async function offlineDeleteContact(contactId: string) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const db = getSqliteDb();
  const contact = db.prepare('SELECT person_id FROM contacts WHERE id = ?').get(contactId) as { person_id: number } | undefined;
  if (!contact) return NextResponse.json({ success: false, error: 'Contact not found' }, { status: 404 });
  const now = new Date().toISOString();
  const del = db.transaction(() => {
    db.prepare('DELETE FROM student_contacts WHERE contact_id = ?').run(contactId);
    db.prepare('UPDATE contacts SET deleted_at = ? WHERE id = ?').run(now, contactId);
    db.prepare('UPDATE people SET deleted_at = ? WHERE id = ?').run(now, contact.person_id);
  });
  del();
  return NextResponse.json({ success: true, message: 'Contact deleted successfully' });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;

  try {
    const params = await props.params;
    const contactId = params.id;
    const body = await req.json();

    if (getDbMode() === 'local-sqlite') {
      return offlinePutContact(contactId, body);
    }

    const {
      contact_first_name = '',
      contact_last_name = '',
      contact_phone,
      contact_email = '',
      contact_address = '',
      relationship = '',
      occupation = '',
      alive_status = 'alive'
    } = body;

    if (!contact_phone) {
      return NextResponse.json({
        success: false,
        error: 'Phone number is required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Get the contact's person_id first
      const [contactRows] = await connection.execute(
        'SELECT person_id FROM contacts WHERE id = ?',
        [contactId]
      );

      if (!Array.isArray(contactRows) || contactRows.length === 0) {
        throw new Error('Contact not found');
      }

      const personId = contactRows[0].person_id;

      // Update person record (name, phone, email, address)
      await connection.execute(`
        UPDATE people
        SET first_name = ?, last_name = ?, phone = ?, email = ?, address = ?
        WHERE id = ?
      `, [contact_first_name, contact_last_name, contact_phone, contact_email, contact_address, personId]);

      // Update contact record (relationship, occupation, alive_status)
      await connection.execute(`
        UPDATE contacts
        SET occupation = ?, alive_status = ?
        WHERE id = ?
      `, [occupation, alive_status, contactId]);

      // Update student_contacts relationship
      if (relationship) {
        await connection.execute(`
          UPDATE student_contacts
          SET relationship = ?
          WHERE contact_id = ?
        `, [relationship, contactId]);
      }

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Contact updated successfully',
        data: { contact_id: contactId }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Contact update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update contact'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;

  try {
    const params = await props.params;
    const contactId = params.id;

    if (getDbMode() === 'local-sqlite') {
      return offlineDeleteContact(contactId);
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Get the contact's person_id first
      const [contactRows] = await connection.execute(
        'SELECT person_id FROM contacts WHERE id = ?',
        [contactId]
      );

      if (!Array.isArray(contactRows) || contactRows.length === 0) {
        throw new Error('Contact not found');
      }

      const personId = contactRows[0].person_id;

      // Delete student_contacts link (soft delete if exists)
      await connection.execute(
        'DELETE FROM student_contacts WHERE contact_id = ?',
        [contactId]
      );

      // Soft delete contact record
      await connection.execute(
        'UPDATE contacts SET deleted_at = NOW() WHERE id = ?',
        [contactId]
      );

      // Soft delete person record
      await connection.execute(
        'UPDATE people SET deleted_at = NOW() WHERE id = ?',
        [personId]
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Contact deleted successfully'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Contact deletion error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete contact'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
