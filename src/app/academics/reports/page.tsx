'use client';

import React, { useEffect, useMemo, useState, createContext, useContext, useRef } from 'react';
import { toast } from 'react-hot-toast';
import Image from 'next/image'; // kept for possible legacy use
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import PromotionSummaryNotification from '@/components/academics/PromotionSummaryNotification';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import type { ReportLayoutJSON } from '@/lib/reportTemplates';
import { DEFAULT_TEMPLATE_JSON } from '@/lib/reportTemplates';
import DualCurriculumTemplate from '@/templates/DualCurriculumTemplate';
import { getSubjectName } from '@/templates/DualCurriculumTemplate';
import { DRCEDocumentRenderer } from '@/components/drce/DRCEDocumentRenderer';
import { isReligiousEducationSubject } from '@/lib/theology-subject-classifier';
import type { DRCEDocument, DRCEDataContext } from '@/lib/drce/schema';
import type { DRCERenderContext } from '@/components/drce/types';
import { useI18n } from '@/components/i18n/I18nProvider';

// Type definitions
interface Student {
  student_id: number;
  photo?: string | null;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name: string;
  class_id?: string | number; // Added class_id as optional
  gender?: string;
  stream_name?: string;
  results: Result[];
  totalMarks?: number;
  averageMarks?: number;
  subjectCount?: number;
  position?: number;
  totalInClass?: number;
  class_teacher_comment?: string;
  dos_comment?: string;
  headteacher_comment?: string;
}

interface Result {
  student_id: number;
  subject_id: number;
  subject_name: string;
  /** Arabic subject name — populated from subjects.name_ar when available */
  name_ar?: string;
  teacher_name?: string;
  score: number;
  result_type_name?: string;
  results_type?: string;
  term?: string;
  term_name?: string;
  academic_year_id?: number;
  academic_year_name?: string;
  class_name: string;
  photo_url?: string;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender?: string;
  stream_name?: string;
  subject_type?: string;
  academic_type?: string;
  mid_term_score?: number;
  end_term_score?: number;
  teacher_initials?: string;
  class_id?: number;
}

interface ClassGroup {
  className: string;
  students: Student[];
}

interface GroupedResult {
  subject_id?: number;
  subject_name: string;
  name_ar?: string;
  teacher_name?: string;
  teacher_initials?: string;
  midTermScore: number | null;
  endTermScore: number | null;
  regularScore: number | null;
  subject_type?: string; // Add subject type
}

interface Filters {
  term: string;
  resultType: string;
  classId: string;
  student: string;
  academicYearId: string;
}

interface AcademicYear {
  id: number;
  name: string;
  status: string;
}

interface Term {
  id: number;
  name: string;
  academic_year_id: number;
}

interface TeacherInitialsContextType {
  teacherInitials: Record<string, string>;
  handleInitialsChange: (initialsKey: string, classId?: string | number, subjectId?: string | number, newInitials?: string) => void;
}

interface CustomizationRef {
  current: Record<string, unknown>;
}

interface SchoolInfo {
  name: string;
  address: string;
  po_box: string;
  logo_url: string;
  contact: string;
  email: string;
  website: string;
  motto: string;
  center_no: string;
  registration_no: string;
  arabic_name: string;
  arabic_address: string;
  arabic_po_box: string;
  arabic_contact: string;
  arabic_center_no: string;
  arabic_registration_no: string;
  arabic_motto: string;
}

interface ApiResponse {
  students?: Student[];
  results?: Result[];
  data?: Result[];
}

// Context for syncing teacher initials
const TeacherInitialsContext = createContext<TeacherInitialsContextType | null>(null);

// Add a PHP API base like in ResultTypesManager to avoid hitting a non-existent Next.js API route
const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';

const ReportsPage = () => {
  const { t, lang: appLang } = useI18n();
  const [filters, setFilters] = useState<Filters>({ term: '', resultType: '', classId: '', student: '', academicYearId: '' });
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [termsData, setTermsData] = useState<Term[]>([]);
  const [allResults, setAllResults] = useState<Result[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [showCustomization, setShowCustomization] = useState(false);
  const [customTab, setCustomTab] = useState('school');
  const [loading, setLoading] = useState(false);
  const [editableTermValue, setEditableTermValue] = useState<string>('');
  const [isEditingTerm, setIsEditingTerm] = useState(false);
  const [teacherInitials, setTeacherInitials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [nextTermBegins, setNextTermBegins] = useState('');
  const TEACHER_INITIALS_STORAGE_KEY = 'drais_teacher_initials';
  const [enableMarkConversion, setEnableMarkConversion] = useState(false);
  const defaultLogoInputRef = useRef<HTMLInputElement>(null);
  const reportExportRef = useRef<HTMLDivElement>(null);
  const [defaultLogoUploading, setDefaultLogoUploading] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>({
    name: '',
    address: '',
    po_box: '',
    logo_url: '/uploads/logo.png',
    contact: '',
    email: '',
    website: '',
    motto: '',
    center_no: '',
    registration_no: '',
    arabic_name: '', arabic_address: '', arabic_po_box: '',
    arabic_contact: '', arabic_center_no: '', arabic_registration_no: '',
    arabic_motto: '',
  });
  const customizationRef = useRef<CustomizationRef>({ current: {} });

  // ── Logo upload handler: uploads to Cloudinary, saves to DB, updates local state
  const handleLogoUpload = async (file: File): Promise<string | null> => {
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'drais/logos');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
      const uploadData = await uploadRes.json();
      if (!uploadData.success || !uploadData.url) return null;

      // Persist to DB via school-config
      await fetch('/api/school-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: uploadData.url }),
      });

      // Update local state so all reports on the page reflect the new logo
      setSchoolInfo(prev => ({ ...prev, logo_url: uploadData.url }));
      return uploadData.url;
    } catch (err) {
      console.error('Logo upload failed:', err);
      return null;
    }
  };

  // ── Template engine: active layout JSON loaded from /api/report-templates/active
  const [activeLayout, setActiveLayout] = useState<ReportLayoutJSON>(DEFAULT_TEMPLATE_JSON);

  // ── Dynamic template system (Phase 9: DRCE Migration)
  // All templates are now loaded from DRCE database
  const [availableDrceTemplates, setAvailableDrceTemplates] = useState<DRCEDocument[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeDrceDoc, setActiveDrceDoc] = useState<DRCEDocument | null>(null);
  const [curriculum, setCurriculum] = useState<'all' | 'secular' | 'theology'>('all');
  // Default the rendered-document language to whatever the user has currently
  // selected app-wide. Schools that print exclusively in Arabic don't have to
  // re-toggle this dropdown on every page load; they can still override it
  // per render via the dropdown below if they want a one-off English copy.
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'ar'>(appLang === 'ar' ? 'ar' : 'en');

  // Fetch all available DRCE templates
  useEffect(() => {
    fetch('/api/dvcf/documents')
      .then(r => r.json())
      .then(data => {
        if (data?.documents && Array.isArray(data.documents)) {
          setAvailableDrceTemplates(data.documents as DRCEDocument[]);
          
          // Auto-select the first default template
          const defaultTemplate = data.documents.find((t: DRCEDocument) => t.meta.is_default);
          if (defaultTemplate) {
            setSelectedTemplateId(defaultTemplate.meta.template_key || defaultTemplate.meta.id);
            setActiveDrceDoc(defaultTemplate);
          }
        }
      })
      .catch(err => {
        console.warn('Failed to load DRCE templates:', err);
      });
  }, []);

  // When selected template changes, update active DRCE document
  useEffect(() => {
    if (!selectedTemplateId) return;
    
    const selected = availableDrceTemplates.find(
      t => t.meta.template_key === selectedTemplateId || t.meta.id === selectedTemplateId
    );
    
    if (selected) {
      setActiveDrceDoc(selected);
      console.log('Rendering template:', selected.meta.name, '| curriculum:', curriculum);
    }
  }, [selectedTemplateId, availableDrceTemplates, curriculum]);

  // Resolve term id from loaded tenant-scoped term rows.
  const getTermId = (termName: string): string => {
    const normalized = String(termName || '').toLowerCase().trim();
    const term = termsData.find(t => String(t.name || '').toLowerCase().trim() === normalized);
    return term ? String(term.id) : '';
  };

  // Fetch promotion data if it's 3rd term
  const { data: promotionData } = useSWR(
    filters.term === 'Term 3' && filters.classId
      ? `/api/academics/promotions?term_id=${getTermId(filters.term)}&class_id=${filters.classId}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const handlePromoteStudents = async (studentIds: number[], newClassId: number) => {
    try {
      const response = await fetch('/api/academics/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds, newClassId, remarks: 'Promoted from 3rd term reports' }),
      });
      const result = await response.json();
      if (result.success) {
        alert(`Successfully promoted ${studentIds.length} student(s)!`);
      } else {
        alert('Failed to promote students: ' + result.message);
      }
    } catch (error) {
      console.error('Error promoting students:', error);
      alert('Error promoting students');
    }
  };

  // School info default — generic placeholders that get overridden by DB-driven API
  const schoolInfoDefault: SchoolInfo = {
    name: '', address: '', po_box: '',
    logo_url: '/uploads/logo.png',
    contact: '', email: '', website: '', motto: '',
    center_no: '', registration_no: '',
    arabic_name: '', arabic_address: '', arabic_po_box: '',
    arabic_contact: '', arabic_center_no: '', arabic_registration_no: '',
    arabic_motto: '',
  };

  // Add Arabic-Indic digits converter (strip dash characters before mapping)
  const toArabicDigits = (input?: string | number | null): string => {
    if (input === null || input === undefined) return '';
    const s = String(input);
    // Remove common dash-like characters before converting digits
    const cleaned = s.replace(/[-–—‑]/g, '');
    const map: Record<string, string> = {
      '0': '٠','1': '١','2': '٢','3': '٣','4': '٤',
      '5': '٥','6': '٦','7': '٧','8': '٨','9': '٩'
    };
    return cleaned.replace(/[0-9]/g, d => map[d]);
  };

  // Fetch academic years, terms, current term/year, persisted initials and next-term date on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/academic_years').then(r => r.json()).catch(() => ({})),
      fetch('/api/terms').then(r => r.json()).catch(() => ({})),
      fetch('/api/academic/current-term').then(r => r.json()).catch(() => ({})),
    ])
      .then(([yearsRes, termsRes, currentTermRes]) => {
        const years = Array.isArray(yearsRes?.data) ? yearsRes.data : [];
        const terms = Array.isArray(termsRes?.data) ? termsRes.data : [];
        setAcademicYears(years);
        setTermsData(terms);

        // Year-first discovery: always select a year by default.
        const currentYearId = currentTermRes?.academic_year_id ? String(currentTermRes.academic_year_id) : '';
        const fallbackYearId = years.length > 0 ? String(years[0].id) : '';
        const nextAcademicYearId = currentYearId || fallbackYearId;

        setFilters(prev => ({
          ...prev,
          academicYearId: prev.academicYearId || nextAcademicYearId,
        }));
      })
      .catch(() => {});

    const localInitials = localStorage.getItem(TEACHER_INITIALS_STORAGE_KEY);
    if (localInitials) {
      try {
        setTeacherInitials(JSON.parse(localInitials));
      } catch (_) {
        localStorage.removeItem(TEACHER_INITIALS_STORAGE_KEY);
      }
    }

    fetch('/api/teacher-initials')
      .then(r => r.json())
      .then(data => {
        if (data?.success && data.data && typeof data.data === 'object') {
          setTeacherInitials((prev) => ({ ...prev, ...data.data }));
        }
      })
      .catch(() => {});
    fetch('/api/next-term')
      .then(r => r.json())
      .then(data => {
        if (data?.data?.nextTermBegins) {
          setNextTermBegins(data.data.nextTermBegins);
        }
      })
      .catch(() => {});
  }, []);

  // Filtered terms based on selected academic year
  const filteredTerms = (Array.isArray(termsData) && termsData.length > 0)
    ? (filters.academicYearId 
        ? termsData.filter(t => t && String(t.academic_year_id) === filters.academicYearId)
        : termsData)
    : [];

  // Fetch all data once on component mount — NO FILTERING, get everything
  useEffect(() => {
    setLoading(true);
    // Fetch ALL results without server-side filtering — client-side filtering via useMemo
    Promise.all([
      fetch('/api/reports/list')
        .then(async r => {
          const data: ApiResponse = await r.json().catch(() => ({}));
          return data;
        }),
      fetch(`/api/school-config`)
        .then(async r => {
          const data = await r.json().catch(() => ({}));
          return data;
        })
    ])
      .then(([reportsData, schoolConfigData]) => {
        const students = reportsData?.students || [];
        const results = reportsData?.results || reportsData?.data || (Array.isArray(reportsData) ? reportsData as Result[] : []);
        setAllStudents(students);
        setAllResults(results);
        
        // Update school info from centralized DB-driven config
        if (schoolConfigData?.school) {
          const s = schoolConfigData.school;
          setSchoolInfo({
            name: s.name || schoolInfoDefault.name,
            address: s.address || schoolInfoDefault.address,
            po_box: s.po_box || schoolInfoDefault.po_box,
            logo_url: s.branding?.logo || s.logo_url || schoolInfoDefault.logo_url,
            contact: s.contact?.phone || schoolInfoDefault.contact,
            email: s.contact?.email || schoolInfoDefault.email,
            website: s.website || schoolInfoDefault.website,
            motto: s.branding?.motto || schoolInfoDefault.motto,
            center_no: s.center_no || schoolInfoDefault.center_no,
            registration_no: s.registration_no || schoolInfoDefault.registration_no,
            arabic_name: s.arabic_name || schoolInfoDefault.arabic_name,
            arabic_address: s.arabic_address || schoolInfoDefault.arabic_address,
            arabic_po_box: s.arabic_po_box || schoolInfoDefault.arabic_po_box,
            arabic_contact: s.arabic_phone || s.contact?.phone || schoolInfoDefault.arabic_contact,
            arabic_center_no: s.arabic_center_no || s.center_no || schoolInfoDefault.arabic_center_no,
            arabic_registration_no: s.arabic_registration_no || s.registration_no || schoolInfoDefault.arabic_registration_no,
            arabic_motto: s.arabic_motto || schoolInfoDefault.arabic_motto,
          });
        }
      })
      .catch(() => {
        setAllStudents([]);
        setAllResults([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Load editable term value from localStorage on mount
  useEffect(() => {
    const savedTermValue = localStorage.getItem('editable_term_value');
    if (savedTermValue) {
      setEditableTermValue(savedTermValue);
    }
  }, []);

  // Save editable term value to localStorage when it changes
  useEffect(() => {
    if (editableTermValue) {
      localStorage.setItem('editable_term_value', editableTermValue);
    }
  }, [editableTermValue]);

  // Enhanced class groups with data validation and error checking
  const classGroups = useMemo((): Record<string, ClassGroup> => {
    const groups: Record<string, ClassGroup> = {};
    
    // Filter out invalid results and remove duplicates
    const validResults = allResults.filter((r, index, arr) => {
      // Basic validation
      if (!r.student_id || !r.class_name || r.score === null || r.score === undefined) {
        return false;
      }
      
      // Ensure score is a valid number
      const score = parseFloat(String(r.score));
      if (isNaN(score)) return false;
      
      // Remove duplicates based on unique combination
      const key = `${r.student_id}_${r.subject_id}_${r.result_type_name || r.results_type}_${r.term || r.term_name || 'no_term'}`;
      const firstIndex = arr.findIndex(item => {
        const itemKey = `${item.student_id}_${item.subject_id}_${item.result_type_name || item.results_type}_${item.term || item.term_name || 'no_term'}`;
        return itemKey === key;
      });
      return firstIndex === index;
    });

    validResults.forEach(r => {
      const className = r.class_name || 'Unknown Class';

      // Additional validation: ensure class name is reasonable and not from old corrupted data
      if (className === 'Unknown Class' || className.length > 20 || !/^[A-Za-z0-9\s\-\.]+$/.test(className)) {
        return; // Skip invalid class names
      }

      // Find the student record to validate class consistency
      const studentRecord = allStudents.find(s => s.student_id === r.student_id);
      const studentClassName = studentRecord?.class_name;

      // Strict validation: only include results where the result's class_name matches the student's actual class
      if (studentClassName && String(studentClassName).toLowerCase().trim() !== String(className).toLowerCase().trim()) {
        // Log for debugging - this will help identify contaminated data
        console.warn(`Class mismatch for student ${r.student_id} (${r.first_name} ${r.last_name}): result shows "${className}" but student record shows "${studentClassName}". Skipping this result.`);
        return; // Skip results with class mismatch
      }

      // Additional validation: ensure result has valid academic year and term data
      if (!r.academic_year_id || (!r.term && !r.term_name)) {
        console.warn(`Missing academic context for student ${r.student_id} (${r.first_name} ${r.last_name}) in ${className}. Skipping this result.`);
        return; // Skip results without proper academic context
      }

      if (!groups[className]) {
        groups[className] = { className, students: [] };
      }

      let student = groups[className].students.find(s => s.student_id === r.student_id);
      if (!student) {
        // Improved photo URL handling for Next.js Image component
        const photoUrl = r.photo_url;

        student = {
          student_id: r.student_id,
          photo: photoUrl,
          admission_no: r.admission_no,
          first_name: r.first_name,
          last_name: r.last_name,
          class_name: r.class_name,
          gender: r.gender,
          stream_name: r.stream_name,
          results: [],
        };
        groups[className].students.push(student);
      }
      student.results.push(r);
    });
    
    // Sort students within each class by name
    Object.values(groups).forEach(g => {
      g.students.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    });
    
    return groups;
  }, [allResults]);

  // Enhanced filtering logic with better validation
  const filteredClassGroups = useMemo((): Record<string, ClassGroup> => {
    let groups = JSON.parse(JSON.stringify(classGroups)) as Record<string, ClassGroup>; // Deep clone to avoid mutations
    
    // Ensure groups is a valid object
    if (!groups || typeof groups !== 'object') {
      return {};
    }
    
    if (filters.classId) {
      const targetClass = String(filters.classId).toLowerCase().trim();
      groups = Object.fromEntries(
        Object.entries(groups).filter(([className, v]) => {
          if (!v || !Array.isArray(v.students)) return false;
          // Strict class matching: only include groups where the class name exactly matches
          const groupClass = String(className || '').toLowerCase().trim();
          const matches = groupClass === targetClass;

          // Log for Northgate debugging
          if (targetClass.includes('top') && groupClass !== targetClass) {
            console.log(`Filtering out class "${groupClass}" for top class filter - only "${targetClass}" allowed`);
          }

          return matches;
        })
      );
    }
    
    Object.values(groups).forEach(g => {
      if (!g || !Array.isArray(g.students)) return;

      // First, filter students to only include those whose class_name matches the group class
      const initialCount = g.students.length;
      g.students = g.students.filter(s => {
        if (!s) return false;
        const studentClass = String(s.class_name || '').toLowerCase().trim();
        const groupClass = String(g.className).toLowerCase().trim();
        const matches = studentClass === groupClass;

        // Log mismatches for debugging (especially for top class)
        if (!matches && groupClass.includes('top')) {
          console.warn(`Removing student ${s.student_id} (${s.first_name} ${s.last_name}) from top class: student class "${studentClass}" doesn't match group class "${groupClass}"`);
        }

        return matches;
      });

      // Log student count changes for top class debugging
      if (String(g.className).toLowerCase().includes('top') && initialCount !== g.students.length) {
        console.log(`Top class "${g.className}": filtered from ${initialCount} to ${g.students.length} students`);
      }

      g.students = g.students.filter(s => {
        if (!s || !Array.isArray(s.results)) return false;
        // Ensure student has valid results
        if (s.results.length === 0) return false;
        
        // Academic year filter — CLIENT-SIDE filtering (was previously server-side)
        if (filters.academicYearId) {
          const hasAYData = s.results.some((r: Result) => r && r.academic_year_id);
          if (hasAYData) {
            const matchesAY = s.results.some((r: Result) =>
              r && String(r.academic_year_id || '') === filters.academicYearId
            );
            if (!matchesAY) {
              console.log(`Student ${s.student_id} (${s.first_name} ${s.last_name}) filtered out: no results for academic year ${filters.academicYearId}`);
              return false;
            }
          }
        }
        
        // Term filter - only apply if term data exists
        if (filters.term) {
          const hasTermData = s.results.some((r: Result) => r && (r.term || r.term_name));
          if (hasTermData) {
            const matchesTerm = s.results.some((r: Result) =>
              r && String(r.term || r.term_name || '').toLowerCase() === filters.term.toLowerCase()
            );
            if (!matchesTerm) return false;
          }
        }
        
        // Result type filter - IMPROVED LOGIC
        if (filters.resultType) {
          const resultTypeFilter = filters.resultType.toLowerCase();
          
          if (resultTypeFilter.includes('end')) {
            // For "End of Term" filter, include students who have:
            // 1. Any result with "end" in the result type, OR
            // 2. Both mid-term and end-term results (for complete End of Term reports)
            const hasEndTermResult = s.results.some((r: Result) =>
              r && String(r.result_type_name || r.results_type || '').toLowerCase().includes('end')
            );
            
            const hasMidTermResult = s.results.some((r: Result) =>
              r && String(r.result_type_name || r.results_type || '').toLowerCase().includes('mid')
            );
            
            // Include if has end-term results OR has both mid and end components
            if (!hasEndTermResult && !hasMidTermResult) return false;
          } else {
            // For other result types, exact match
            const matchesResultType = s.results.some((r: Result) =>
              r && String(r.result_type_name || r.results_type || '').toLowerCase() === resultTypeFilter
            );
            if (!matchesResultType) return false;
          }
        }
        
        // Student name/ID filter
        if (filters.student) {
          const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
          if (!name.includes(filters.student.toLowerCase()) && String(s.student_id || '') !== filters.student) {
            return false;
          }
        }
        
        return true;
      });
    });
    
    // Remove empty classes
    groups = Object.fromEntries(Object.entries(groups).filter(([_, v]) => v && Array.isArray(v.students) && v.students.length > 0));

    // Final logging for top class debugging
    Object.entries(groups).forEach(([className, group]) => {
      if (String(className).toLowerCase().includes('top')) {
        console.log(`Northgate top class "${className}" final count: ${group.students.length} students`);
        // Log student details for verification
        group.students.forEach((student, index) => {
          console.log(`  ${index + 1}. ${student.first_name} ${student.last_name} (ID: ${student.student_id}, Class: ${student.class_name})`);
        });
      }
    });

    return groups;
  }, [classGroups, filters]);

  // Helper: check if a single result row matches current filters - IMPROVED
  const matchesFilters = (r: Result): boolean => {
    // Academic year filter
    if (filters.academicYearId && r.academic_year_id) {
      if (String(r.academic_year_id) !== filters.academicYearId) return false;
    }
    
    if (filters.resultType) {
      const rt = String(r.result_type_name || r.results_type || '').toLowerCase();
      const filterType = filters.resultType.toLowerCase();
      
      if (filterType.includes('end')) {
        // For End of Term filter, include both mid and end results
        return rt.includes('mid') || rt.includes('end');
      } else {
        // For other filters, exact match
        return rt === filterType;
      }
    }
    if (filters.term) {
      const term = String(r.term || r.term_name || '').toLowerCase();
      if (term !== filters.term.toLowerCase()) return false;
    }
    return true;
  };

  // Enhanced class-based positioning with proper per-class ranking
  const classGroupsWithPositions = useMemo((): Record<string, ClassGroup> => {
    const groups: Record<string, ClassGroup> = JSON.parse(JSON.stringify(filteredClassGroups));

    // Ensure groups is a valid object
    if (!groups || typeof groups !== 'object') {
      return {};
    }

    // Process each class independently for proper class-based positioning
    Object.values(groups).forEach((classGroup: ClassGroup) => {
      // Ensure classGroup and its students are valid arrays
      if (!classGroup || !Array.isArray(classGroup.students)) {
        return;
      }

      // Filter results per student based on current filters
      classGroup.students.forEach((student: Student) => {
        if (!student) return;
        student.results = (Array.isArray(student.results) ? student.results : []).filter((r: Result) => {
          // Validate result data
          if (!r || r.score === null || r.score === undefined || isNaN(parseFloat(String(r.score)))) return false;
          return matchesFilters(r);
        });
      });
       
      // Remove students with no valid results after filtering
      classGroup.students = (Array.isArray(classGroup.students) ? classGroup.students : []).filter((s: Student) => s && s.results && Array.isArray(s.results) && s.results.length > 0);
      
      // Calculate total marks for each student in this class
      classGroup.students.forEach((student: Student) => {
        if (!student) return;
        const validScores = (Array.isArray(student.results) ? student.results : [])
          .map((r: Result) => parseFloat(String(r.score || 0)))
          .filter(score => !isNaN(score) && score >= 0);
        
        student.totalMarks = validScores.reduce((sum, score) => sum + score, 0);
        student.averageMarks = validScores.length > 0 ? Math.round(student.totalMarks / validScores.length) : 0;
        student.subjectCount = validScores.length;
      });
      
      // Sort students by total marks within this class (highest first)
      classGroup.students.sort((a: Student, b: Student) => {
        const totalA = a && a.totalMarks ? a.totalMarks : 0;
        const totalB = b && b.totalMarks ? b.totalMarks : 0;
        if (totalB !== totalA) return totalB - totalA;
        
        // If total marks are equal, sort by average
        const avgA = a && a.averageMarks ? a.averageMarks : 0;
        const avgB = b && b.averageMarks ? b.averageMarks : 0;
        if (avgB !== avgA) return avgB - avgA;
        
        // If still equal, sort by name
        return (a && a.last_name ? a.last_name : '').localeCompare(b && b.last_name ? b.last_name : '');
      });
      
      // Assign positions within this class only
      classGroup.students.forEach((student: Student, index: number) => {
        if (student) {
          student.position = index + 1;
          student.totalInClass = classGroup.students.length; // Class-specific total
        }
      });
    });

    // Remove classes that have no students after processing
    Object.keys(groups).forEach((className) => {
      if (!groups[className] || !Array.isArray(groups[className].students) || !groups[className].students.length) {
        delete groups[className];
      }
    });

    return groups;
  }, [filteredClassGroups, filters.term, filters.resultType]);

  // Helper to split results into principal and other subjects
  function splitSubjects(results: any[]) {
    const principal: any[] = [];
    const others: any[] = [];
    if (!Array.isArray(results)) {
      return { principal, others };
    }
    results.forEach(r => {
      if (!r) return; // Skip null/undefined items
      const st = (r.subject_type ?? 'core').toLowerCase();
      const isIRE = isReligiousEducationSubject(r.subject_name);
      if (st === 'core' || isIRE) principal.push(r);
      else others.push(r);
    });
    return { principal, others };
  }

  // Enhanced helper to group results by subject with better error handling
  function groupResultsBySubject(results: Result[]): GroupedResult[] {
    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }

    const grouped: Record<string, GroupedResult> = {};
    
    results.forEach((result) => {
      if (!result) return; // Skip null/undefined results
      
      const subjectKey = String(result.subject_id || result.subject_name);
      if (!subjectKey) return; // Skip invalid results
      
      if (!grouped[subjectKey]) {
        grouped[subjectKey] = {
          subject_id: result.subject_id,
          subject_name: result.subject_name || `Subject ${subjectKey}`,
          name_ar: result.name_ar,
          teacher_name: result.teacher_name,
          teacher_initials: result.teacher_initials,
          midTermScore: null,
          endTermScore: null,
          regularScore: null,
          subject_type: result.subject_type || 'core', // Add subject type
        };
      }
      
      const resultType = (result.result_type_name || result.results_type || '').toLowerCase();
      const score = parseFloat(String(result.score || 0));
      
      // Handle different result types
      if (resultType.includes('mid')) {
        grouped[subjectKey].midTermScore = score;
      } else if (resultType.includes('end')) {
        grouped[subjectKey].endTermScore = score;
        if (result.mid_term_score !== undefined && result.mid_term_score !== null) {
          grouped[subjectKey].midTermScore = parseFloat(String(result.mid_term_score || 0));
        }
        if (result.end_term_score !== undefined && result.end_term_score !== null) {
          grouped[subjectKey].endTermScore = parseFloat(String(result.end_term_score || 0));
        }
      } else {
        grouped[subjectKey].regularScore = score;
        if (result.mid_term_score !== undefined && result.mid_term_score !== null) {
          grouped[subjectKey].midTermScore = parseFloat(String(result.mid_term_score || 0));
        }
        if (result.end_term_score !== undefined && result.end_term_score !== null) {
          grouped[subjectKey].endTermScore = parseFloat(String(result.end_term_score || 0));
        }
      }
    });
    
    // Cross-reference logic for missing scores
    const allSubjects = new Set(results.map(r => r ? String(r.subject_id || r.subject_name) : null).filter(Boolean));
    
    allSubjects.forEach(subjectKey => {
      if (!subjectKey || !grouped[subjectKey]) return;
      
      const subjectResults = results.filter(r => r && String(r.subject_id || r.subject_name) === subjectKey);
      
      if (grouped[subjectKey].midTermScore === null) {
        const midTermResult = subjectResults.find(r => 
          r && (r.result_type_name || r.results_type || '').toLowerCase().includes('mid')
        );
        if (midTermResult) {
          grouped[subjectKey].midTermScore = parseFloat(String(midTermResult.score || 0));
        }
      }
      
      if (grouped[subjectKey].endTermScore === null) {
        const endTermResult = subjectResults.find(r => 
          r && (r.result_type_name || r.results_type || '').toLowerCase().includes('end')
        );
        if (endTermResult) {
          grouped[subjectKey].endTermScore = parseFloat(String(endTermResult.score || 0));
        }
      }
    });
    
    return Object.values(grouped).filter(item => item && item.subject_name);
  }

  // Helper function to check if student is in Nursery section
  function isNurseryStudent(className: string): boolean {
    const nurseryKeywords = ['nursery', 'baby', 'kindergarten', 'middle', 'top', 'pre', 'reception'];
    return nurseryKeywords.some(keyword => 
      className.toLowerCase().includes(keyword)
    );
  }

  // Updated grading function with new scale
  function getGrade(score: number, isNursery: boolean = false) {
    const standardGrade = (() => {
      if (score >= 90) return 'D1';
      if (score >= 80) return 'D2';
      if (score >= 70) return 'C3';
      if (score >= 60) return 'C4';
      if (score >= 50) return 'C5';
      if (score >= 44) return 'C6';
      if (score >= 40) return 'P7';
      if (score >= 34) return 'P8';
      return 'F9';
    })();

    if (!isNursery) return standardGrade;

    // Nursery grade mapping
    switch (standardGrade) {
      case 'D1':
      case 'D2':
        return 'A';
      case 'C3':
      case 'C4':
        return 'B';
      case 'C5':
      case 'C6':
        return 'C';
      case 'P7':
      case 'P8':
        return 'D';
      case 'F9':
        return 'E';
      default:
        return 'E';
    }
  }

  // Helper function to get overall grade for Nursery (mode of grades)
  function getNurseryOverallGrade(grades: string[]): string {
    if (grades.length === 0) return 'C';

    // Count frequency of each grade
    const gradeCount: Record<string, number> = {};
    grades.forEach(grade => {
      gradeCount[grade] = (gradeCount[grade] || 0) + 1;
    });

    // Find the most frequent grade(s)
    const maxCount = Math.max(...Object.values(gradeCount));
    const mostFrequentGrades = Object.keys(gradeCount).filter(
      grade => gradeCount[grade] === maxCount
    );

    // If there's a clear majority, return it
    if (mostFrequentGrades.length === 1) {
      return mostFrequentGrades[0];
    }

    // If grades are balanced, return 'C'
    return 'C';
  }
  
  function getGradePoint(grade: string) {
    switch (grade) {
      case 'D1': return 1;
      case 'D2': return 2;
      case 'C3': return 3;
      case 'C4': return 4;
      case 'C5': return 5;
      case 'C6': return 6;
      case 'P7': return 7;
      case 'P8': return 8;
      case 'F9': return 9;
      default: return 9;
    }
  }
  
  function getDivision(aggregates: number) {
    if (aggregates <= 12) return 'Division 1';
    if (aggregates <= 24) return 'Division 2';
    if (aggregates <= 28) return 'Division 3';
    if (aggregates <= 32) return 'Division 4';
    return 'Division U';
  }

  function isMathSubject(subjectName?: string): boolean {
    const normalized = (subjectName || '').toLowerCase();
    return normalized.includes('math') || normalized.includes('mathematics');
  }
  
  function commentsForGrade(grade: string) {
    // Nursery grades (A-D)
    if (grade === 'A') return 'Outstanding performance! Excellent work.';
    if (grade === 'B') return 'Very good work! Keep up the great effort.';
    if (grade === 'C') return 'Good progress! Continue working hard.';
    if (grade === 'D') return 'Needs more effort. Please work harder.';
    if (grade === 'E') return 'Requires significant improvement. Seek extra help.';

    // Standard grades (D1, D2, C3, etc.)
    if (grade === 'D1') return 'Excellent results, keep it up.';
    if (grade === 'D2') return 'Very good score, but aim at excellency.';
    if (grade === 'C3') return 'Satisfactory performance, please work harder.';
    if (grade === 'C4') return 'Needs improvement, consider seeking help.';
    if (grade === 'C5') return 'Unsatisfactory, please see your teacher.';
    if (grade === 'C6') return 'Needs improvement, consider seeking help.';
    if (grade === 'P8') return 'Passed, but you can do better.';
    if (grade === 'F9') return 'Failed, please see your teacher for guidance.';
    return 'Continue working hard.';
  }

  // Save initials to backend
  const persistTeacherInitials = (values: Record<string, string>) => {
    try {
      localStorage.setItem(TEACHER_INITIALS_STORAGE_KEY, JSON.stringify(values));
    } catch (error) {
      console.warn('Unable to persist initials in localStorage', error);
    }
  };

  const saveInitialsToBackend = async (classId: string, subjectId: string, newInitials: string): Promise<void> => {
    setSaving(true);
    try {
      const response = await fetch('/api/teacher-initials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, subjectId, initials: newInitials }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to save initials');
      }
      toast.success('Initials saved successfully');
      setTeacherInitials((prev) => {
        const next = { ...prev, [`${classId}-${subjectId}`]: newInitials };
        persistTeacherInitials(next);
        return next;
      });
    } catch (error: any) {
      console.error('Failed to save initials:', error);
      toast.error(error?.message || 'Failed to save initials');
    } finally {
      setSaving(false);
    }
  };

  // Ensure any inline edits are flushed before printing/exporting
  const flushInitialsBeforePrint = async (): Promise<void> => {
    try {
      try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch (e) { /* ignore */ }
      await new Promise((res) => setTimeout(res, 150));

      const entries = Object.entries(teacherInitials).filter(([k]) => /^\d+-\d+$/.test(k));
      if (!entries.length) return;

      // Try bulk endpoint first (optional). If not available, fall back to per-item saves.
      try {
        const payload = entries.map(([k, v]) => {
          const [classId, subjectId] = k.split('-');
          return { classId, subjectId, initials: v };
        });
        const bulkResp = await fetch('/api/teacher-initials/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload }),
        });
        if (bulkResp.ok) return;
      } catch (e) {
        // ignore and fallback
      }

      await Promise.all(entries.map(async ([k, v]) => {
        const [classId, subjectId] = k.split('-');
        try {
          await fetch('/api/teacher-initials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId, subjectId, initials: v }),
          });
        } catch (err) {
          // ignore individual failures during flush
        }
      }));
    } catch (err) {
      // no-op
    }
  };

  const handlePrint = async (): Promise<void> => {
    await flushInitialsBeforePrint();
    const reportArea = reportExportRef.current;
    if (!reportArea) {
      toast.error('Report area not found.');
      return;
    }

    const hasRenderedReports = reportArea.querySelector('.reportPage, .dual-report-page, [data-report-page="true"]');
    if (!hasRenderedReports) {
      toast.error('No reports are currently available to print.');
      return;
    }

    const printRootId = 'drce-report-print-root';
    const existingStyle = document.getElementById(printRootId);
    if (existingStyle) existingStyle.remove();

    const styleEl = document.createElement('style');
    styleEl.id = printRootId;
    styleEl.textContent = `
      @media print {
        body > *:not([data-print-root]) {
          display: none !important;
        }
        body {
          background: #fff !important;
          margin: 0;
          padding: 0;
        }
        [data-print-root] {
          display: block !important;
          width: 100% !important;
          max-width: none !important;
        }
        .no-print {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
    reportArea.setAttribute('data-print-root', 'true');

    window.print();

    window.setTimeout(() => {
      reportArea.removeAttribute('data-print-root');
      styleEl.remove();
    }, 1500);
  };

  // Export reports to PDF
  const exportToPDF = async (): Promise<void> => {
    await flushInitialsBeforePrint();
    const reportArea = reportExportRef.current;
    if (!reportArea) {
      window.alert('Report area not found!');
      return;
    }

    const hasRenderedReports = reportArea.querySelector('.reportPage, .dual-report-page, [data-report-page="true"]');
    if (!hasRenderedReports) {
      window.alert('No reports are currently available to export.');
      return;
    }

    try {
      // Use html2canvas to capture the report area
      const canvas = await html2canvas(reportArea, {
        scale: 3, // Increase scale for high-resolution rendering
        useCORS: true, // Enable cross-origin for images
        allowTaint: false, // Prevent tainted canvas errors
        logging: false, // Disable logging for production
        backgroundColor: '#ffffff', // Ensure white background for the PDF
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      // Add the captured image to the PDF
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

      // Save the PDF
      pdf.save('Reports.pdf');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      window.alert('Failed to export PDF. Please try again.');
    }
  };

  // Export reports to Excel
  const exportToExcel = async (): Promise<void> => {
    await flushInitialsBeforePrint();
    const workbook = XLSX.utils.book_new();
    Object.values(classGroupsWithPositions).forEach((classGroup: ClassGroup) => {
      const worksheetData: (string | number)[][] = [
        ['Student Name', 'Subject', 'Teacher Initials', 'Score'],
        ...classGroup.students.flatMap((student: Student) =>
          student.results.map((result: Result) => [
            `${student.first_name} ${student.last_name}`,
            result.subject_name,
            teacherInitials[`${result.class_id}-${result.subject_id}`] || result.teacher_initials || 'N/A',
            result.score,
          ])
        ),
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, classGroup.className);
    });
    XLSX.writeFile(workbook, 'Reports.xlsx');
  };

  // Handle inline editing of teacher initials
  const handleInitialsChange = (initialsKey: string, classId?: number, subjectId?: number, newInitials?: string): void => {
    setTeacherInitials((prev) => {
      const next = {
        ...prev,
        [initialsKey]: newInitials || '',
      };
      persistTeacherInitials(next);
      return next;
    });
  };

  // Sync "Next Term Begins" field across all reports
  const handleNextTermChange = (newDate: string) => {
    setNextTermBegins(newDate);
    // Optionally save to backend
    fetch('/api/next-term', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextTermBegins: newDate }),
    }).catch(console.error);
  };

  // Inject/remove the @page landscape rule dynamically — cannot be done in
  // static styled-jsx because @page is not scopeable to a CSS class.
  useEffect(() => {
    const STYLE_ID = 'drais-print-page-size';
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    // Check if active template uses landscape orientation
    const isLandscape = activeDrceDoc?.theme?.orientation === 'landscape';
    if (isLandscape) {
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        document.head.appendChild(el);
      }
      el.textContent = '@media print { @page { size: A4 landscape; margin: 10mm; } }';
    } else {
      el?.remove();
    }
    return () => { document.getElementById(STYLE_ID)?.remove(); };
  }, [activeDrceDoc?.theme?.orientation]);

  return (
    <TeacherInitialsContext.Provider value={{ teacherInitials, handleInitialsChange }}>
      <div className="px-4 mt-0">
        {/* Promotion Summary Notification - Only for 3rd Term */}
        {filters.term === 'Term 3' && promotionData && (promotionData as any)?.success && (
          <div className="mb-6 no-print">
            <PromotionSummaryNotification
              data={(promotionData as any).data}
              onPromoteStudents={handlePromoteStudents}
            />
          </div>
        )}

        {/* Filter Section at the top - Hidden when printing */}
        <div className="no-print mb-4 space-y-3">
          {/* Row 1: Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.academicYearId}
              onChange={(e) => setFilters((f) => ({ ...f, academicYearId: e.target.value, term: '' }))}
              className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              title={`${t('actions.filter')} — ${t('academicTime.academicYear')}`}
            >
              <option value="">{`${t('common.all')} — ${t('academicTime.academicYears')}`}</option>
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name} {ay.status === 'active' ? '(Current)' : ''}
                </option>
              ))}
            </select>

            <select
              value={filters.term}
              onChange={(e) => setFilters((f) => ({ ...f, term: e.target.value }))}
              className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="">{`${t('common.all')} — ${t('academicTime.terms')}`}</option>
            {filteredTerms.length > 0
              ? filteredTerms.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))
              : <>
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </>
            }
          </select>

          <select
            value={filters.resultType}
            onChange={(e) => setFilters((f) => ({ ...f, resultType: e.target.value }))}
            className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            <option value="">{`${t('common.all')} — ${t('academic.resultTypes')}`}</option>
            {[...new Set(allResults.map((r) => r.result_type_name || r.results_type))]
              .filter(Boolean)
              .map((rt) => (
                <option key={rt} value={rt}>
                  {rt}
                </option>
              ))}
          </select>

          <select
            value={filters.classId}
            onChange={(e) => setFilters((f) => ({ ...f, classId: e.target.value }))}
            className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            <option value="">{`${t('common.all')} — ${t('orgUnits.classes')}`}</option>
            {[...new Set(
              allStudents.length
                ? allStudents.map((s) => s.class_name || s.class_id)
                : allResults.map((r) => r.class_name)
            )]
              .filter(Boolean)
              .map((cid) => {
                const label = allStudents.length
                  ? allStudents.find((s) => (s.class_name || s.class_id) === cid)?.class_name || cid
                  : cid;
                return (
                  <option key={cid} value={cid}>
                    {label}
                  </option>
                );
              })}
          </select>

          <input
            value={filters.student}
            onChange={(e) => setFilters((f) => ({ ...f, student: e.target.value }))}
            placeholder={t('people.student')}
            className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors min-w-[160px]"
          />

          {/* Template selector — Phase 9: Dynamic DRCE templates */}
          <select
            value={selectedTemplateId || ''}
            onChange={(e) => {
              const key = e.target.value;
              setSelectedTemplateId(key);
            }}
            className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
            title={t('drce.template')}
          >
            {availableDrceTemplates.length === 0 ? (
              <option value="">{t('common.loading')}</option>
            ) : (
              availableDrceTemplates.map(template => (
                <option key={template.meta.id} value={template.meta.template_key || template.meta.id}>
                  {template.meta.name}
                </option>
              ))
            )}
          </select>

          {/* Curriculum filter — Phase 2 */}
          <select
            value={curriculum}
            onChange={(e) => setCurriculum(e.target.value as 'all' | 'secular' | 'theology')}
            className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            title={`${t('actions.filter')} — ${t('academic.curriculum')}`}
          >
            <option value="all">All Subjects</option>
            <option value="secular">Secular Only</option>
            <option value="theology">Theology Only</option>
          </select>

          {/* Language selector — Phase 5, wired to state */}
          <select
            value={selectedLanguage === 'ar' ? 'Arabic' : 'English'}
            onChange={(e) => setSelectedLanguage(e.target.value === 'Arabic' ? 'ar' : 'en')}
            className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            title={t('settings.language')}
          >
            <option value="English">English</option>
            <option value="Arabic">العربية</option>
          </select>
          </div>

          {/* Row 2: Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 shadow-sm hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print
          </button>

          <button
            onClick={exportToPDF}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-emerald-600 shadow-sm hover:bg-emerald-700 active:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export PDF
          </button>

          <button
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-teal-600 shadow-sm hover:bg-teal-700 active:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Export Excel
          </button>

          <button
            onClick={() => setShowCustomization(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-gray-600 shadow-sm hover:bg-gray-700 active:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Customize
          </button>

          <a
            href="/reports/kitchen"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-amber-600 shadow-sm hover:bg-amber-700 active:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 transition-colors no-underline"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            Template Kitchen
          </a>

          <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
            {loading && <span className="inline-flex items-center gap-1"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading...</span>}
            {!loading && classGroupsWithPositions && Object.keys(classGroupsWithPositions).length > 0 && (
              <span>{Object.values(classGroupsWithPositions).reduce((sum, g) => sum + (g && Array.isArray(g.students) ? g.students.length : 0), 0)} students in {Object.keys(classGroupsWithPositions).length} class(es)</span>
            )}
          </div>
          </div>
        </div>
        <div ref={reportExportRef} id="academic-reports-export-area" data-report-export-root="true">
          {/* Reports rendering temporarily disabled for syntax isolation. */}
          <div className="no-print text-center py-12">Reports rendering disabled (temp)</div>
        </div>

        <style jsx global>{`
          .no-print,
          button,
          select,
          input,
          label {
            display: none !important;
          }
            .px-4, .mt-0, .p-4 {
              padding: 0 !important;
              margin: 0 !important;
            }

            div[class*="px-4"], div[class*="mt-0"] {
              padding: 0 !important;
              margin: 0 !important;
            }

            .reportPage {
              page-break-inside: avoid;
              page-break-after: always;
              width: 100% !important;
              max-width: 100% !important;
              box-shadow: none !important;
              border: none !important;
              margin: 0 !important;
              padding: 16px 18px !important;
              border-radius: 0 !important;
            }

            .reportPage:first-of-type {
              margin-top: 0 !important;
              padding-top: 0 !important;
            }

            .classHeading {
              display: none !important;
            }

            .reportPage,
            .reportPage * {
              font-size: 12px !important;
            }

            .fixed {
              display: none !important;
            }

            body > div {
              margin-top: 0 !important;
              padding-top: 0 !important;
            }
          }
        `}</style>
      </div>
    </TeacherInitialsContext.Provider>
  );
};

export default ReportsPage;

// Inline style objects (mimic old CSS)
// NOTE: All layout now comes from the active ReportLayoutJSON template.
// These legacy style references remain only for the tahfiz/reports page.
// This file uses activeLayout from /api/report-templates/active instead.

// Adjust division based on the presence of F9 grades
function downgradeDivision(division: string): string {
  switch (division) {
    case 'Division 1': return 'Division 2';
    case 'Division 2': return 'Division 3';
    case 'Division 3': return 'Division 4';
    case 'Division 4': return 'Division U';
    default: return division;
  }
}

function adjustDivisionForF9(division: string, grades: string[], mathFail: boolean = false): string {
  const failCount = grades.filter(g => g === 'F9').length;
  if (failCount === 0) return division;

  let downgradeSteps = 1;
  if (mathFail) downgradeSteps += 1;

  let adjusted = division;
  for (let i = 0; i < downgradeSteps; i += 1) {
    const nextDivision = downgradeDivision(adjusted);
    if (nextDivision === adjusted) break;
    adjusted = nextDivision;
  }

  return adjusted;
}

// Enhanced calculation function for marks with conditional conversion
function calculateMarks(groupedResult: GroupedResult, isEndOfTerm: boolean, enableConversion: boolean = false) {
  let midTermMarks = 0;
  let endTermMarks = 0;

  const m = groupedResult.midTermScore;
  const e = groupedResult.endTermScore;
  const r = groupedResult.regularScore;

  if (enableConversion) {
    // Apply conversion ONLY when button is clicked: MT (40→100), EOT (60→100)
    if (m !== null) {
      midTermMarks = Math.round((m / 100) * 40);
    }
    if (e !== null) {
      endTermMarks = Math.round((e / 100) * 60);
    }
  } else {
    if (m !== null) {
      midTermMarks = Math.round(m);
    }
    if (e !== null) {
      endTermMarks = Math.round(e);
    }
  }

  // Total calculation: Only use end-term marks for EOT reports
  const totalMarks = isEndOfTerm ? endTermMarks : midTermMarks;

  return { midTermMarks, endTermMarks, totalMarks };
}

// Helper function to get comments based on division
function getCommentsByDivision(division: string) {
  const comments = {
    'Division 1': {
      classTeacher: 'Brilliant!! all my hopes are in you.',
      dos: 'Outstanding Results, keep focused.',
      headteacher: 'Great work done, keep it up.'
    },
    'Division 2': {
      classTeacher: 'Promising results, keep more focused.',
      dos: 'Very good performance, keep it up.',
      headteacher: 'You are a first grade material, keep more focused.'
    },
    'Division 3': {
      classTeacher: 'Improve and make it to the next grade.',
      dos: 'Good effort, but more work needed.',
      headteacher: 'You need to be active in discussions.'
    },
    'Division 4': {
      classTeacher: 'You have to be very active in the discussion groups.',
      dos: 'More effort is needed from you.',
      headteacher: 'You are capable of improving, just keep focused.'
    },
    'Division U': {
      classTeacher: 'More concentration is needed from you in order to perform better.',
      dos: 'Work very hard to improve your performance.',
      headteacher: 'Concentrate more on academics for a better performance.'
    },
    // Nursery grade comments
    'A': {
      classTeacher: 'Excellent performance! Keep up the great work.',
      dos: 'Outstanding achievement in all areas.',
      headteacher: 'Exceptional learner, continue to excel.'
    },
    'B': {
      classTeacher: 'Very good work, aim for excellence.',
      dos: 'Good progress, keep working hard.',
      headteacher: 'Well done, you can achieve even more.'
    },
    'C': {
      classTeacher: 'Satisfactory progress, more effort needed.',
      dos: 'Average performance, room for improvement.',
      headteacher: 'Work harder to improve your performance.'
    },
    'D': {
      classTeacher: 'Needs more attention and practice.',
      dos: 'Below average, requires extra support.',
      headteacher: 'More focus and effort is needed.'
    },
    'E': {
      classTeacher: 'Requires immediate intervention and support.',
      dos: 'Needs significant improvement.',
      headteacher: 'Extra help and attention required.'
    }
  };
  
  return comments[division as keyof typeof comments] || comments['Division U'];
}

// Comments section as a component
function CommentsSection({
  student,
  division,
  nextTermBegins,
  handleNextTermChange,
  layout,
}: {
  student: any;
  division: string;
  nextTermBegins: string;
  handleNextTermChange: (newDate: string) => void;
  layout: import('@/lib/reportTemplates').ReportLayoutJSON;
}) {
  const divisionComments = getCommentsByDivision(division);
  const ribbonStyle = {
    display: 'inline-block',
    position: 'relative' as const,
    background: layout.comments.ribbon.background,
    color: layout.comments.ribbon.color,
    fontWeight: 'bold',
    padding: layout.comments.ribbon.padding,
    borderRadius: layout.comments.ribbon.borderRadius,
    marginRight: 18,
    marginBottom: 8,
    fontSize: 14,
  };
  const textStyle = {
    color: layout.comments.text.color,
    fontStyle: layout.comments.text.fontStyle as any,
    borderBottom: layout.comments.text.borderBottom,
  };
  
  return (
    <div style={{ marginTop: '1%' }}>
      Comments/Remarks
      <div style={{ marginTop: 2 }}>
        <div style={{ marginBottom: 10, width: '100%' }}>
          <span style={ribbonStyle}>Class Teacher&apos;s Comment:</span>
          <span style={textStyle}>{student.class_teacher_comment || divisionComments.classTeacher}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={ribbonStyle}>DOS Comment:</span>
          <span style={textStyle}>{student.dos_comment || divisionComments.dos}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={ribbonStyle}>Headteacher&apos;s Comment:</span>
          <span style={textStyle}>{student.headteacher_comment || divisionComments.headteacher}</span>
        </div>
        <div
          contentEditable
          suppressContentEditableWarning
          style={{ textDecoration: 'underline dashed', marginTop: 12, cursor: 'text' }}
          onBlur={(e) => handleNextTermChange(e.currentTarget.textContent?.trim() || nextTermBegins)}
        >
          {nextTermBegins}
        </div>
        <div style={{ textDecoration: 'underline dashed', marginTop: 5 }}>Next Term Begins</div>
      </div>
    </div>
  );
}

// Grade table as a component
function GradeTable({ layout }: { layout: import('@/lib/reportTemplates').ReportLayoutJSON }) {
  const thStyle = {
    background: layout.gradeTable.th.background,
    border: layout.gradeTable.th.border,
    textAlign: layout.gradeTable.th.textAlign as any,
    padding: layout.gradeTable.th.padding,
  };
  const tdStyle = {
    border: layout.gradeTable.td.border,
    textAlign: layout.gradeTable.td.textAlign as any,
    padding: layout.gradeTable.td.padding,
  };
  return (
    <div style={{ marginTop: 20, width: '100%', fontSize: 13 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <th style={thStyle}>GRADE</th>
            <th style={thStyle}>D1</th>
            <th style={thStyle}>D2</th>
            <th style={thStyle}>C3</th>
            <th style={thStyle}>C4</th>
            <th style={thStyle}>C5</th>
            <th style={thStyle}>C6</th>
            <th style={thStyle}>P7</th>
            <th style={thStyle}>P8</th>
            <th style={thStyle}>F9</th>
          </tr>
          <tr>
            <td style={tdStyle}>SCORE RANGE</td>
            <td style={tdStyle}>90–100</td>
            <td style={tdStyle}>80–89</td>
            <td style={tdStyle}>70–79</td>
            <td style={tdStyle}>60–69</td>
            <td style={tdStyle}>50–59</td>
            <td style={tdStyle}>44–49</td>
            <td style={tdStyle}>40–43</td>
            <td style={tdStyle}>34–39</td>
            <td style={tdStyle}>0–33</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
