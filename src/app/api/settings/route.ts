import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { invalidateSchoolCache } from '@/lib/schoolDB';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/settings?school_id=1
 * Returns the school's full settings including school info from the schools table
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // schoolId derived from session below

    connection = await getConnection();

    // Get school info
    const [schools]: any = await connection.execute(
      `SELECT id, name, legal_name, short_code, email, phone, address, logo_url, 
              motto, district, website, founded_year, country, region,
              principal_name, principal_phone, registration_number, school_type, status
       FROM schools WHERE id = ?`,
      [schoolId]
    );

    // Get additional settings from settings table
    const [settingsRows]: any = await connection.execute(
      `SELECT setting_key, setting_value, setting_type, category FROM settings WHERE school_id = ?`,
      [schoolId]
    );

    const school = schools.length > 0 ? schools[0] : null;
    
    // Build settings map by category
    const settingsMap: Record<string, Record<string, any>> = {};
    for (const row of settingsRows) {
      if (!settingsMap[row.category]) {
        settingsMap[row.category] = {};
      }
      // Parse value based on type
      let value = row.setting_value;
      if (row.setting_type === 'number') value = parseFloat(value) || 0;
      else if (row.setting_type === 'boolean') value = value === 'true' || value === '1';
      else if (row.setting_type === 'json') {
        try { value = JSON.parse(value); } catch { /* leave as string */ }
      }
      settingsMap[row.category][row.setting_key] = value;
    }

    return NextResponse.json({
      success: true,
      data: {
        school: school || {},
        settings: settingsMap,
      }
    });
  } catch (error: any) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch settings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.end(); } catch {} 
    }
  }
}

/**
 * PUT /api/settings
 * Updates school information and/or settings
 * Body: { schoolId, school?: {...}, settings?: { category: { key: value } } }
 */
export async function PUT(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();

    connection = await getConnection();
    await connection.beginTransaction();

    // Update school table if school data provided
    if (body.school) {
      const allowedFields = [
        'name', 'legal_name', 'short_code', 'email', 'phone', 'address',
        'logo_url', 'motto', 'district', 'website', 'founded_year',
        'country', 'region', 'principal_name', 'principal_phone',
        'registration_number', 'school_type'
      ];

      const updates: string[] = [];
      const values: any[] = [];

      for (const field of allowedFields) {
        if (body.school[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(body.school[field]);
        }
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        values.push(schoolId);
        await connection.execute(
          `UPDATE schools SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }
    }

    // Update settings table if settings data provided
    if (body.settings && typeof body.settings === 'object') {
      for (const [category, entries] of Object.entries(body.settings)) {
        if (typeof entries === 'object' && entries !== null) {
          for (const [key, value] of Object.entries(entries as Record<string, any>)) {
            // Determine type
            let settingType = 'string';
            let settingValue = String(value);
            if (typeof value === 'number') {
              settingType = 'number';
              settingValue = String(value);
            } else if (typeof value === 'boolean') {
              settingType = 'boolean';
              settingValue = value ? 'true' : 'false';
            } else if (typeof value === 'object') {
              settingType = 'json';
              settingValue = JSON.stringify(value);
            }

            // Upsert setting
            await connection.execute(
              `INSERT INTO settings (school_id, setting_key, setting_value, setting_type, category)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type), updated_at = NOW()`,
              [schoolId, key, settingValue, settingType, category]
            );
          }
        }
      }
    }

    await connection.commit();

    // Invalidate cache so all routes pick up new school info
    invalidateSchoolCache(schoolId);

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error: any) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    console.error('Settings update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update settings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.end(); } catch {}
    }
  }
}
