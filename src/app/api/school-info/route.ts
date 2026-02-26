import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(req: NextRequest) {
  let connection;
  try {
    connection = await getConnection();

    // Try to fetch from schools table first
    const [schoolRows] = await connection.execute(
      'SELECT id, name as school_name, legal_name, email, phone, address, logo_url FROM schools WHERE id = 1 AND deleted_at IS NULL LIMIT 1'
    );

    if (schoolRows && (schoolRows as any[]).length > 0) {
      return NextResponse.json({
        success: true,
        data: {
          school_name: 'Ibun Baz Girls Secondary School', // Override to ensure correct name is displayed
          school_address: (schoolRows as any[])[0].address || 'Kampala, Uganda',
          school_contact: (schoolRows as any[])[0].phone || '+256 700 123 456',
          school_email: (schoolRows as any[])[0].email || 'info@albayan.ac.ug',
        }
      });
    }

    // Fallback: Try to fetch from school_settings table
    const [settingsRows] = await connection.execute(
      'SELECT key_name, value_text FROM school_settings WHERE school_id = 1'
    );

    if (settingsRows && (settingsRows as any[]).length > 0) {
      const settings: Record<string, string> = {};
      for (const row of (settingsRows as any[])) {
        settings[row.key_name] = row.value_text;
      }

      return NextResponse.json({
        success: true,
        data: {
          school_name: settings.school_name || 'Ibun Baz Girls Secondary School',
          school_address: settings.school_address || 'Kampala, Uganda',
          school_contact: settings.school_phone || settings.school_contact || '+256 700 123 456',
          school_email: settings.school_email || 'info@albayan.ac.ug',
        }
      });
    }

    // Return default values if no school data found
    return NextResponse.json({
      success: true,
      data: {
        school_name: 'Ibun Baz Girls Secondary School',
        school_address: 'Kampala, Uganda',
        school_contact: '+256 700 123 456',
        school_email: 'info@hillsideways.ac.ug',
      }
    });

  } catch (error: any) {
    console.error('Error fetching school info:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch school info',
      data: {
        school_name: 'Ibun Baz Girls Secondary School',
        school_address: 'Kampala, Uganda',
        school_contact: '+256 700 123 456',
        school_email: 'info@hillsideways.ac.ug',
      }
    });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}
