import { NextRequest, NextResponse } from 'next/server';
import { getSchoolFromDB, invalidateSchoolCache } from '@/lib/schoolDB';
import { getConnection } from '@/lib/db';


import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // schoolId derived from session below
    
    // Get school info from database (single source of truth)
    const schoolInfo = await getSchoolFromDB(schoolId);
    
    return NextResponse.json({
      success: true,
      data: {
        school_name: schoolInfo.name,
        school_motto: schoolInfo.motto || '',
        school_address: schoolInfo.address,
        school_contact: schoolInfo.phone,
        school_email: schoolInfo.email,
        school_logo: schoolInfo.logo_url,
        school_district: schoolInfo.district,
        website: schoolInfo.website,
        founded_year: schoolInfo.founded_year,
        school_type: schoolInfo.school_type,
        principal_name: schoolInfo.principal_name,
        principal_phone: schoolInfo.principal_phone,
        registration_number: schoolInfo.registration_number,
        country: schoolInfo.country,
        region: schoolInfo.region,
      }
    });
  } catch (error: any) {
    console.error('Error fetching school info:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch school info',
      data: {
        school_name: 'School',
        school_address: '',
        school_contact: '',
        school_email: '',
      }
    });
  }
}

/**
 * PUT /api/school-info
 * Updates school information in the schools table
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

    // Map form field names to DB column names
    const fieldMap: Record<string, string> = {
      school_name: 'name',
      school_motto: 'motto',
      school_address: 'address',
      school_contact: 'phone',
      school_email: 'email',
      school_logo: 'logo_url',
      school_district: 'district',
      website: 'website',
      founded_year: 'founded_year',
      school_type: 'school_type',
      principal_name: 'principal_name',
      principal_phone: 'principal_phone',
      principal_email: 'email', // map to existing email if no separate field
      registration_number: 'registration_number',
      country: 'country',
      region: 'region',
    };

    const updates: string[] = [];
    const values: any[] = [];

    for (const [formField, dbColumn] of Object.entries(fieldMap)) {
      if (body[formField] !== undefined) {
        updates.push(`${dbColumn} = ?`);
        values.push(body[formField]);
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

    // Invalidate school cache
    invalidateSchoolCache(schoolId);

    return NextResponse.json({
      success: true,
      message: 'School information updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating school info:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update school info',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.end(); } catch {}
    }
  }
}
