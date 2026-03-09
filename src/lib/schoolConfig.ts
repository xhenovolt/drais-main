/**
 * @deprecated — DO NOT import from this file for new code.
 * 
 * USE INSTEAD:
 *   Server-side:  import { getSchoolFromDB } from '@/lib/schoolDB';
 *   Client-side:  import { useSchoolConfig } from '@/hooks/useSchoolConfig';
 *   One-off fetch: import { fetchSchoolConfigAsync } from '@/hooks/useSchoolConfig';
 * 
 * This file exists only as a legacy shim that reads school-config.json.
 * The TRUE source of truth is the `schools` table in the database,
 * served via /api/school-config (DB-driven) and /api/school-info.
 */
import fs from 'fs';
import path from 'path';

let cachedConfig: any = null;

/**
 * Load school configuration from school-config.json
 * Uses in-memory caching to avoid repeated file reads
 */
export function loadSchoolConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = path.join(process.cwd(), 'school-config.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(configData);
    console.log('[School Config] Loaded configuration from school-config.json');
    return cachedConfig;
  } catch (error) {
    console.warn('[School Config] Failed to load configuration, using defaults:', error);
    // Fallback configuration — NO hardcoded school identity
    cachedConfig = {
      school: {
        name: 'School',
        shortName: '',
        address: '',
        contact: {
          phone: '',
          email: '',
        },
        principal: {
          name: '',
          title: 'Headteacher',
        },
        branding: {
          logo: '/uploads/logo.png',
          motto: '',
        },
      },
    };
    return cachedConfig;
  }
}

/**
 * Get school information
 */
export function getSchoolInfo() {
  const config = loadSchoolConfig();
  return config.school;
}

/**
 * Get specific school detail
 */
export function getSchoolDetail(key: string, defaultValue?: any) {
  const config = loadSchoolConfig();
  const school = config.school;
  
  const keys = key.split('.');
  let value: any = school;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return defaultValue;
    }
  }
  
  return value;
}

/**
 * Clear cached configuration (useful for testing or refresh)
 */
export function clearSchoolConfigCache() {
  cachedConfig = null;
}

/**
 * Browser-side function to fetch school config from API
 */
export async function fetchSchoolConfig() {
  try {
    const response = await fetch('/api/school-config');
    if (response.ok) {
      const data = await response.json();
      return data.school || data;
    }
  } catch (error) {
    console.warn('[School Config] Failed to fetch from API:', error);
  }
  return null;
}
