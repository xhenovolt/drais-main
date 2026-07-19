/**
 * src/lib/theology-subject-classifier.ts
 * 
 * Automatically classifies subjects as theology based on name patterns.
 * Called on subject creation/import to ensure proper subject_type tagging.
 */

export interface ClassificationResult {
  isTheology: boolean;
  classifiedType: 'theology' | 'secular' | 'core';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const THEOLOGY_KEYWORDS = [
  'quran',
  'fiqh',
  'tawhid',
  'hadith',
  'akhlaq',
  'islamic',
  'tajweed',
  'sirah',
  'theology',
  'religion',
  'sunnah',
  'ijaza',
];

const SECULAR_KEYWORDS = [
  'mathematics',
  'english',
  'science',
  'biology',
  'chemistry',
  'physics',
  'geography',
  'history',
  'civics',
  'french',
  'german',
  'swahili',
  'kiswahili',
  'ict',
  'computer',
  'business',
  'economics',
  'accounting',
  'literature',
  'art',
  'music',
  'sports',
  'physical',
];

/**
 * Classify a subject based on its name
 * Used during subject creation to auto-tag theology vs secular
 */
export function classifySubject(subjectName: string): ClassificationResult {
  const normalized = (subjectName || '').toLowerCase().trim();

  // Explicit override: Islamic Religious Education is treated as secular.
  if (normalized.includes('islamic religious education')) {
    return {
      isTheology: false,
      classifiedType: 'secular',
      confidence: 'high',
      reason: 'Islamic Religious Education is explicitly treated as secular',
    };
  }

  // Check theology keywords
  for (const keyword of THEOLOGY_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return {
        isTheology: true,
        classifiedType: 'theology',
        confidence: normalized === keyword ? 'high' : 'medium',
        reason: `Subject name contains theology keyword: "${keyword}"`,
      };
    }
  }

  // Check secular keywords
  for (const keyword of SECULAR_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return {
        isTheology: false,
        classifiedType: 'secular',
        confidence: 'high',
        reason: `Subject name contains secular keyword: "${keyword}"`,
      };
    }
  }

  // Default to core if no match
  return {
    isTheology: false,
    classifiedType: 'core',
    confidence: 'low',
    reason: 'No classification keywords found; defaulting to core',
  };
}

/**
 * Get the appropriate subject_type enum value
 */
export function getSubjectType(subjectName: string): 'theology' | 'secular' | 'core' {
  return classifySubject(subjectName).classifiedType;
}

/**
 * Validate if a subject should be classified as theology
 */
export function isTheologySubject(subjectNameOrType: string | undefined): boolean {
  if (!subjectNameOrType) return false;
  
  // If it's already tagged with subject_type
  const lower = subjectNameOrType.toLowerCase();
  if (lower === 'theology') return true;
  
  // Otherwise classify by name
  return classifySubject(subjectNameOrType).isTheology;
}

/**
 * Get all theology subject translations for both languages
 * Used when rendering theology results
 */
export const THEOLOGY_SUBJECTS_COMMON = {
  'Quran': { en: 'Quran', ar: 'القرآن الكريم' },
  'Quranic Studies': { en: 'Quranic Studies', ar: 'دراسات قرآنية' },
  'Quran Memorization': { en: 'Quran Memorization', ar: 'حفظ القرآن' },
  'Fiqh': { en: 'Fiqh', ar: 'الفقه' },
  'Islamic Jurisprudence': { en: 'Islamic Jurisprudence', ar: 'الفقه الإسلامي' },
  'Tawhid': { en: 'Tawhid', ar: 'التوحيد' },
  'Islamic Theology': { en: 'Islamic Theology', ar: 'العقيدة الإسلامية' },
  'Hadith': { en: 'Hadith', ar: 'الحديث الشريف' },
  'Hadith Studies': { en: 'Hadith Studies', ar: 'دراسات الحديث' },
  'Sunnah': { en: 'Sunnah', ar: 'السنة النبوية' },
  'Akhlaq': { en: 'Akhlaq', ar: 'الأخلاق' },
  'Islamic Ethics': { en: 'Islamic Ethics', ar: 'الأخلاق الإسلامية' },
  'Islamic Studies': { en: 'Islamic Studies', ar: 'الدراسات الإسلامية' },
  'Islamic History': { en: 'Islamic History', ar: 'التاريخ الإسلامي' },
  'Sirah': { en: 'Sirah', ar: 'السيرة النبوية' },
  'Tajweed': { en: 'Tajweed', ar: 'أحكام التجويد' },
};
