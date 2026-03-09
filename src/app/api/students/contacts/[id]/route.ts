import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  let connection;
  
  try {
    const params = await props.params;
    const contactId = params.id;
    const body = await req.json();
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
  let connection;
  
  try {
    const params = await props.params;
    const contactId = params.id;

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
