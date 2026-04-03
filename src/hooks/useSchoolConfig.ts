/**
 * useSchoolConfig — THE single client-side hook for school identity.
 *
 * Every component that needs school name, address, logo, motto, etc.
 * MUST use this hook instead of hardcoding values.
 *
 * Data flows:  DB → /api/school-config → SWR cache → React component
 *
 * Usage:
 *   const { school, isLoading } = useSchoolConfig();
 *   return <h1>{school.name}</h1>;
 */
import useSWR from 'swr';

export interface SchoolConfig {
  name: string;
  shortName: string;
  fullName: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  principalName: string;
  principalTitle: string;
  logo: string;
  motto: string;
  poBox: string;
  centerNo: string;
  registrationNo: string;
  arabicName: string;
  arabicAddress: string;
  arabicPhone: string;
  arabicPoBox: string;
  arabicCenterNo: string;
  arabicRegistrationNo: string;
  arabicMotto: string;
  schoolType: string;
  district: string;
  website: string;
  foundedYear: number | null;
}

/** Safe fallback — generic placeholders only, NO hardcoded school identity */
const EMPTY_SCHOOL: SchoolConfig = {
  name: 'School',
  shortName: '',
  fullName: 'School',
  address: '',
  city: '',
  country: 'Uganda',
  phone: '',
  email: '',
  principalName: '',
  principalTitle: 'Headteacher',
  logo: '/uploads/logo.png',
  motto: '',
  poBox: '',
  centerNo: '',
  registrationNo: '',
  arabicName: '',
  arabicAddress: '',
  arabicPhone: '',
  arabicPoBox: '',
  arabicCenterNo: '',
  arabicRegistrationNo: '',
  arabicMotto: '',
  schoolType: '',
  district: '',
  website: '',
  foundedYear: null,
};

const fetcher = async (url: string): Promise<SchoolConfig> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch school config');
  const json = await res.json();
  const s = json.school || {};
  return {
    name: s.name || EMPTY_SCHOOL.name,
    shortName: s.shortName || EMPTY_SCHOOL.shortName,
    fullName: s.fullName || s.name || EMPTY_SCHOOL.fullName,
    address: s.address || EMPTY_SCHOOL.address,
    city: s.city || s.district || EMPTY_SCHOOL.city,
    country: s.country || EMPTY_SCHOOL.country,
    phone: s.contact?.phone || s.phone || EMPTY_SCHOOL.phone,
    email: s.contact?.email || s.email || EMPTY_SCHOOL.email,
    principalName: s.principal?.name || s.principalName || EMPTY_SCHOOL.principalName,
    principalTitle: s.principal?.title || EMPTY_SCHOOL.principalTitle,
    logo: s.branding?.logo || s.logo || EMPTY_SCHOOL.logo,
    motto: s.branding?.motto || s.motto || EMPTY_SCHOOL.motto,
    poBox: s.po_box || EMPTY_SCHOOL.poBox,
    centerNo: s.center_no || EMPTY_SCHOOL.centerNo,
    registrationNo: s.registration_no || EMPTY_SCHOOL.registrationNo,
    arabicName: s.arabic_name || EMPTY_SCHOOL.arabicName,
    arabicAddress: s.arabic_address || EMPTY_SCHOOL.arabicAddress,
    arabicPhone: s.arabic_phone || EMPTY_SCHOOL.arabicPhone,
    arabicPoBox: s.arabic_po_box || EMPTY_SCHOOL.arabicPoBox,
    arabicCenterNo: s.arabic_center_no || EMPTY_SCHOOL.arabicCenterNo,
    arabicRegistrationNo: s.arabic_registration_no || EMPTY_SCHOOL.arabicRegistrationNo,
    arabicMotto: s.arabic_motto || EMPTY_SCHOOL.arabicMotto,
    schoolType: s.school_type || EMPTY_SCHOOL.schoolType,
    district: s.district || EMPTY_SCHOOL.district,
    website: s.website || EMPTY_SCHOOL.website,
    foundedYear: s.founded_year ?? EMPTY_SCHOOL.foundedYear,
  };
};

/**
 * React hook — fetches school config via SWR with 5-minute dedup window.
 * All components sharing this hook will reuse the same cached data.
 */
export function useSchoolConfig() {
  const { data, error, isLoading, mutate } = useSWR<SchoolConfig>(
    '/api/school-config',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 5 * 60 * 1000, // 5 minutes — school config rarely changes
    }
  );

  return {
    school: data || EMPTY_SCHOOL,
    isLoading,
    error,
    /** Call after updating school settings to refresh all consumers */
    refresh: () => mutate(),
  };
}

/**
 * Standalone async fetcher for non-hook contexts (PDF generation, etc.)
 * Avoids SWR — just does a plain fetch.
 */
export async function fetchSchoolConfigAsync(): Promise<SchoolConfig> {
  try {
    return await fetcher('/api/school-config');
  } catch {
    return { ...EMPTY_SCHOOL };
  }
}

export { EMPTY_SCHOOL };
export default useSchoolConfig;
