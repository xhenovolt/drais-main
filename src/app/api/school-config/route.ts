import { NextRequest, NextResponse } from 'next/server';
import { getSchoolFromDB, invalidateSchoolCache } from '@/lib/schoolDB';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/school-config
 * Returns school configuration from the DATABASE (single source of truth).
 * Compatible response shape for consumers that expect { school: { name, address, contact, principal, branding } }
 */
export async function GET(request: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    // schoolId derived from session below
    const info = await getSchoolFromDB(schoolId);

    // Return in a shape compatible with both old consumers and new ones
    return NextResponse.json({
      success: true,
      school: {
        name: info.name,
        shortName: info.short_code || '',
        fullName: info.name,
        address: info.address,
        city: info.district || '',
        country: info.country || 'Uganda',
        contact: {
          phone: info.phone,
          email: info.email,
        },
        principal: {
          name: info.principal_name || '',
          title: 'Headteacher',
        },
        branding: {
          logo: info.logo_url || '/uploads/logo.png',
          motto: info.motto || '',
        },
        // Extended fields from DB
        po_box: info.po_box || '',
        center_no: info.center_no || '',
        registration_no: info.registration_number || '',
        arabic_name: info.arabic_name || '',
        arabic_address: info.arabic_address || '',
        arabic_phone: info.arabic_phone || '',
        arabic_po_box: info.arabic_po_box || '',
        arabic_center_no: info.arabic_center_no || '',
        arabic_registration_no: info.arabic_registration_no || '',
        arabic_motto: info.arabic_motto || '',
        school_type: info.school_type || '',
        district: info.district || '',
        website: info.website || '',
        founded_year: info.founded_year,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] School config error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load school configuration',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/school-config
 * Admin endpoint to update school configuration in the DATABASE.
 */
export async function POST(request: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await request.json();

    connection = await getConnection();

    const fieldMap: Record<string, string> = {
      name: 'name',
      shortName: 'short_code',
      address: 'address',
      city: 'district',
      country: 'country',
      phone: 'phone',
      email: 'email',
      principal_name: 'principal_name',
      motto: 'motto',
      logo: 'logo_url',
      school_type: 'school_type',
      website: 'website',
      po_box: 'po_box',
      center_no: 'center_no',
      registration_no: 'registration_number',
      arabic_name: 'arabic_name',
      arabic_address: 'arabic_address',
      arabic_phone: 'arabic_phone',
      arabic_po_box: 'arabic_po_box',
      arabic_center_no: 'arabic_center_no',
      arabic_registration_no: 'arabic_registration_no',
      arabic_motto: 'arabic_motto',
      founded_year: 'founded_year',
    };

    const updates: string[] = [];
    const values: any[] = [];

    // Handle flat fields
    for (const [formKey, dbCol] of Object.entries(fieldMap)) {
      if (body[formKey] !== undefined) {
        updates.push(`${dbCol} = ?`);
        values.push(body[formKey]);
      }
    }

    // Handle nested contact/principal/branding from old-shape callers
    if (body.contact?.phone !== undefined) { updates.push('phone = ?'); values.push(body.contact.phone); }
    if (body.contact?.email !== undefined) { updates.push('email = ?'); values.push(body.contact.email); }
    if (body.principal?.name !== undefined) { updates.push('principal_name = ?'); values.push(body.principal.name); }
    if (body.branding?.logo !== undefined) { updates.push('logo_url = ?'); values.push(body.branding.logo); }
    if (body.branding?.motto !== undefined) { updates.push('motto = ?'); values.push(body.branding.motto); }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(schoolId);
      await connection.execute(
        `UPDATE schools SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    invalidateSchoolCache(schoolId);

    return NextResponse.json({
      success: true,
      message: 'School configuration updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] School config update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update school configuration',
        message: error.message,
      },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try { await connection.end(); } catch {}
    }
  }
}
