import { getConnection } from '@/lib/db';

export interface SchoolInfo {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo_url: string | null;
  motto: string | null;
  district: string | null;
  website: string | null;
  founded_year: number | null;
  country: string | null;
  region: string | null;
  principal_name: string | null;
  principal_phone: string | null;
  registration_number: string | null;
  short_code: string | null;
  school_type: string | null;
  po_box: string | null;
  center_no: string | null;
  arabic_name: string | null;
  arabic_address: string | null;
  arabic_phone: string | null;
  arabic_center_no: string | null;
  arabic_registration_no: string | null;
  arabic_motto: string | null;
  arabic_po_box: string | null;
}

const DEFAULT_SCHOOL: SchoolInfo = {
  id: 1,
  name: 'School',
  email: '',
  phone: '',
  address: '',
  logo_url: null,
  motto: null,
  district: null,
  website: null,
  founded_year: null,
  country: 'Uganda',
  region: null,
  principal_name: null,
  principal_phone: null,
  registration_number: null,
  short_code: null,
  school_type: null,
  po_box: null,
  center_no: null,
  arabic_name: null,
  arabic_address: null,
  arabic_phone: null,
  arabic_center_no: null,
  arabic_registration_no: null,
  arabic_motto: null,
  arabic_po_box: null,
};

// In-memory cache to avoid repeated DB calls
let cachedSchool: Record<number, { data: SchoolInfo; timestamp: number }> = {};
const CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Get school information from the database.
 * Uses a 1-minute in-memory cache for performance.
 * Falls back to safe defaults if the DB is unavailable.
 */
export async function getSchoolFromDB(schoolId: number = 1): Promise<SchoolInfo> {
  // Check cache
  const cached = cachedSchool[schoolId];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  let connection;
  try {
    connection = await getConnection();
    // Use SELECT * for resilience — works even if some columns don't exist yet
    const [rows]: any = await connection.execute(
      `SELECT * FROM schools WHERE id = ? LIMIT 1`,
      [schoolId]
    );

    if (rows.length > 0) {
      const r = rows[0];
      const school: SchoolInfo = {
        id: r.id,
        name: r.name || DEFAULT_SCHOOL.name,
        email: r.email || '',
        phone: r.phone || '',
        address: r.address || '',
        logo_url: r.logo_url || null,
        motto: r.motto || null,
        district: r.district || null,
        website: r.website || null,
        founded_year: r.founded_year || null,
        country: r.country || 'Uganda',
        region: r.region || null,
        principal_name: r.principal_name || null,
        principal_phone: r.principal_phone || null,
        registration_number: r.registration_number || null,
        short_code: r.short_code || null,
        school_type: r.school_type || null,
        po_box: r.po_box || null,
        center_no: r.center_no || null,
        arabic_name: r.arabic_name || null,
        arabic_address: r.arabic_address || null,
        arabic_phone: r.arabic_phone || null,
        arabic_center_no: r.arabic_center_no || null,
        arabic_registration_no: r.arabic_registration_no || null,
        arabic_motto: r.arabic_motto || null,
        arabic_po_box: r.arabic_po_box || null,
      };

      // Update cache
      cachedSchool[schoolId] = { data: school, timestamp: Date.now() };
      return school;
    }
  } catch (error) {
    console.error('[getSchoolFromDB] Error fetching school info:', error);
  } finally {
    if (connection) {
      try { await connection.end(); } catch (_) {}
    }
  }

  return { ...DEFAULT_SCHOOL, id: schoolId };
}

/**
 * Invalidate the school cache (call after updating school settings)
 */
export function invalidateSchoolCache(schoolId?: number) {
  if (schoolId) {
    delete cachedSchool[schoolId];
  } else {
    cachedSchool = {};
  }
}
