// src/components/drce/types.ts
// Shared render-time context for all DRCE section renderers.

export interface DRCESchoolInfo {
  name: string;
  arabic_name?: string;
  address?: string;
  contact?: string;
  center_no?: string;
  registration_no?: string;
  logo_url?: string;
}

export interface DRCERenderContext {
  school: DRCESchoolInfo;
  /** Whether this render is for print (disables interactive elements) */
  isPrint?: boolean;
}
