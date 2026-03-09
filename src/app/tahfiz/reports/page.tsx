'use client';

import React, { useEffect, useMemo, useState, createContext, useContext, useRef } from 'react';
import Image from 'next/image';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import PromotionSummaryNotification from '@/components/academics/PromotionSummaryNotification';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';

// Type definitions
interface Student {
  student_id: number;
  photo?: string | null;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name: string;
  gender?: string;
  group_name?: string;
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
  teacher_name?: string;
  score: number;
  result_type_name?: string;
  results_type?: string;
  term?: string;
  term_name?: string;
  class_name: string;
  photo_url?: string;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender?: string;
  group_name?: string;
  subject_type?: string;
  mid_term_score?: number;
  end_term_score?: number;
  teacher_initials?: string;
  class_id?: number;
  comment?: string; // Add this property to store comments for each result
}

interface ClassGroup {
  className: string;
  students: Student[];
}

interface GroupedResult {
  subject_name: string;
  teacher_name?: string;
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
}

interface TeacherInitialsContextType {
  teacherInitials: Record<string, string>;
  handleInitialsChange: (classId: string, subjectId: string, newInitials: string) => void;
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
  center_no: string;
  registration_no: string;
  arabic_name: string;
  arabic_address: string;
  arabic_contact: string;
  arabic_center_no: string;
  arabic_registration_no: string;
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
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allResults, setAllResults] = useState<Result[]>([]);
  const [filters, setFilters] = useState<Filters>({ term: '', resultType: '', classId: '', student: '' });
  const [loading, setLoading] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [customTab, setCustomTab] = useState('school');
  const [teacherInitials, setTeacherInitials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [nextTermBegins, setNextTermBegins] = useState('18-AUG-2025');
  const [enableMarkConversion, setEnableMarkConversion] = useState(false);
  const [editableTermValue, setEditableTermValue] = useState<string>('');
  const [isEditingTerm, setIsEditingTerm] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>({
    name: '',
    address: '',
    po_box: '',
    logo_url: '/uploads/logo.png',
    contact: '',
    center_no: '',
    registration_no: '',
    arabic_name: '',
    arabic_address: '',
    arabic_contact: '',
    arabic_center_no: '',
    arabic_registration_no: '',
  });
  const customizationRef = useRef<CustomizationRef>({ current: {} });

  // Helper to get term ID (you may need to adjust based on your database)
  const getTermId = (termName: string): string => {
    const termMap: Record<string, string> = { 'Term 1': '1', 'Term 2': '2', 'Term 3': '3' };
    return termMap[termName] || '1';
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
    name: '',
    address: '',
    po_box: '',
    logo_url: '/uploads/logo.png',
    contact: '',
    center_no: '',
    registration_no: '',
    arabic_name: '',
    arabic_address: '',
    arabic_contact: '',
    arabic_center_no: '',
    arabic_registration_no: '',
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

  useEffect(() => {
    setLoading(true);
    // Use new DB (Next.js API)
    Promise.all([
      fetch(`/api/reports/list`)
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
            center_no: s.center_no || schoolInfoDefault.center_no,
            registration_no: s.registration_no || schoolInfoDefault.registration_no,
            arabic_name: s.arabic_name || schoolInfoDefault.arabic_name,
            arabic_address: s.arabic_address || schoolInfoDefault.arabic_address,
            arabic_contact: s.contact?.phone || schoolInfoDefault.arabic_contact,
            arabic_center_no: schoolInfoDefault.arabic_center_no,
            arabic_registration_no: schoolInfoDefault.arabic_registration_no,
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
          group_name: r.group_name,
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

  // Filter results to only include Tahfiz learners
  const tahfizClassGroups = useMemo((): Record<string, ClassGroup> => {
    const tahfizGroups: Record<string, ClassGroup> = {};

    Object.entries(classGroups).forEach(([className, group]) => {
      if (className.toLowerCase().includes('tahfiz')) {
        tahfizGroups[className] = group;
      }
    });

    return tahfizGroups;
  }, [classGroups]);

  // Enhanced filtering logic with better validation
  const filteredClassGroups = useMemo((): Record<string, ClassGroup> => {
    let groups = JSON.parse(JSON.stringify(classGroups)) as Record<string, ClassGroup>; // Deep clone to avoid mutations
    
    if (filters.classId) {
      groups = Object.fromEntries(
        Object.entries(groups).filter(([_, v]) =>
          String(v.className).toLowerCase() === String(filters.classId).toLowerCase() ||
          v.students.some(s => String(s.class_name).toLowerCase() === String(filters.classId).toLowerCase())
        )
      );
    }
    
    Object.values(groups).forEach(g => {
      g.students = g.students.filter(s => {
        // Ensure student has valid results
        if (!s.results || s.results.length === 0) return false;
        
        // Term filter - only apply if term data exists
        if (filters.term) {
          const hasTermData = s.results.some((r: Result) => r.term || r.term_name);
          if (hasTermData) {
            const matchesTerm = s.results.some((r: Result) =>
              String(r.term || r.term_name || '').toLowerCase() === filters.term.toLowerCase()
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
              String(r.result_type_name || r.results_type || '').toLowerCase().includes('end')
            );
            
            const hasMidTermResult = s.results.some((r: Result) =>
              String(r.result_type_name || r.results_type || '').toLowerCase().includes('mid')
            );
            
            // Include if has end-term results OR has both mid and end components
            if (!hasEndTermResult && !hasMidTermResult) return false;
          } else {
            // For other result types, exact match
            const matchesResultType = s.results.some((r: Result) =>
              String(r.result_type_name || r.results_type || '').toLowerCase() === resultTypeFilter
            );
            if (!matchesResultType) return false;
          }
        }
        
        // Student name/ID filter
        if (filters.student) {
          const name = `${s.first_name} ${s.last_name}`.toLowerCase();
          if (!name.includes(filters.student.toLowerCase()) && String(s.student_id) !== filters.student) {
            return false;
          }
        }
        
        return true;
      });
    });
    
    // Remove empty classes
    groups = Object.fromEntries(Object.entries(groups).filter(([_, v]) => v.students.length > 0));
    return groups;
  }, [classGroups, filters]);

  // Helper: check if a single result row matches current filters - IMPROVED
  const matchesFilters = (r: Result): boolean => {
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
  const tahfizClassGroupsWithPositions = useMemo((): Record<string, ClassGroup> => {
    const groups: Record<string, ClassGroup> = JSON.parse(JSON.stringify(tahfizClassGroups));

    // Process each class independently for proper class-based positioning
    Object.values(groups).forEach((classGroup: ClassGroup) => {
      // Filter results per student based on current filters
      classGroup.students.forEach((student: Student) => {
        student.results = (student.results || []).filter((r: Result) => {
          // Validate result data
          if (!r.score || isNaN(parseFloat(String(r.score)))) return false;
          return matchesFilters(r);
        });
      });
       
      // Remove students with no valid results after filtering
      classGroup.students = classGroup.students.filter((s: Student) => s.results && s.results.length > 0);
      
      // Calculate total marks for each student in this class
      classGroup.students.forEach((student: Student) => {
        const validScores = (student.results || [])
          .map((r: Result) => parseFloat(String(r.score || 0)))
          .filter(score => !isNaN(score) && score >= 0);
        
        student.totalMarks = validScores.reduce((sum, score) => sum + score, 0);
        student.averageMarks = validScores.length > 0 ? Math.round(student.totalMarks / validScores.length) : 0;
        student.subjectCount = validScores.length;
      });
      
      // Sort students by total marks within this class (highest first)
      classGroup.students.sort((a: Student, b: Student) => {
        const totalA = a.totalMarks || 0;
        const totalB = b.totalMarks || 0;
        if (totalB !== totalA) return totalB - totalA;
        
        // If total marks are equal, sort by average
        const avgA = a.averageMarks || 0;
        const avgB = b.averageMarks || 0;
        if (avgB !== avgA) return avgB - avgA;
        
        // If still equal, sort by name
        return (a.last_name || '').localeCompare(b.last_name || '');
      });
      
      // Assign positions within this class only
      classGroup.students.forEach((student: Student, index: number) => {
        student.position = index + 1;
        student.totalInClass = classGroup.students.length; // Class-specific total
      });
    });

    // Remove classes that have no students after processing
    Object.keys(groups).forEach((className) => {
      if (!groups[className].students.length) {
        delete groups[className];
      }
    });

    return groups;
  }, [tahfizClassGroups, filters.term, filters.resultType]);

  // Helper to split results into principal and other subjects
  function splitSubjects(results: any[]) {
    const principal: any[] = [];
    const others: any[] = [];
    results.forEach(r => {
      const st = (r.subject_type ?? 'core').toLowerCase();
      if (st === 'core') principal.push(r);
      else others.push(r);
    });
    return { principal, others };
  }

  // Enhanced helper to group results by subject with better error handling
  function groupResultsBySubject(results: Result[]): GroupedResult[] {
    const grouped: Record<string, GroupedResult> = {};
    
    results.forEach((result) => {
      const subjectKey = String(result.subject_id || result.subject_name);
      if (!subjectKey) return; // Skip invalid results
      
      if (!grouped[subjectKey]) {
        grouped[subjectKey] = {
          subject_name: result.subject_name || `Subject ${subjectKey}`,
          teacher_name: result.teacher_name,
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
    const allSubjects = new Set(results.map(r => String(r.subject_id || r.subject_name)));
    
    allSubjects.forEach(subjectKey => {
      if (!grouped[subjectKey]) return;
      
      const subjectResults = results.filter(r => String(r.subject_id || r.subject_name) === subjectKey);
      
      if (grouped[subjectKey].midTermScore === null) {
        const midTermResult = subjectResults.find(r => 
          (r.result_type_name || r.results_type || '').toLowerCase().includes('mid')
        );
        if (midTermResult) {
          grouped[subjectKey].midTermScore = parseFloat(String(midTermResult.score || 0));
        }
      }
      
      if (grouped[subjectKey].endTermScore === null) {
        const endTermResult = subjectResults.find(r => 
          (r.result_type_name || r.results_type || '').toLowerCase().includes('end')
        );
        if (endTermResult) {
          grouped[subjectKey].endTermScore = parseFloat(String(endTermResult.score || 0));
        }
      }
    });
    
    return Object.values(grouped).filter(item => item.subject_name);
  }

  // Helper function to check if student is in Nursery section
  function isNurseryStudent(className: string): boolean {
    const nurseryKeywords = ['nursery', 'baby', 'kindergarten', 'pre', 'reception'];
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
  
  function commentsForGrade(grade: string) {
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
  const saveInitialsToBackend = async (classId: string, subjectId: string, newInitials: string): Promise<void> => {
    setSaving(true);
    try {
      await fetch('/api/teacher-initials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, subjectId, initials: newInitials }),
      });
    } catch (error) {
      console.error('Failed to save initials:', error);
    } finally {
      setSaving(false);
    }
  };

  // Export reports to PDF
  const exportToPDF = async (): Promise<void> => {
    const reportArea = document.querySelector('.p-4') as HTMLElement; // Ensure this targets the correct container
    if (!reportArea) {
      window.alert('Report area not found!');
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
  const exportToExcel = (): void => {
    const workbook = XLSX.utils.book_new();
    Object.values(tahfizClassGroupsWithPositions as Record<string, ClassGroup>).forEach((classGroup: ClassGroup) => {
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
  const handleInitialsChange = (classId: string, subjectId: string, newInitials: string): void => {
    setTeacherInitials((prev) => ({
      ...prev,
      [`${classId}-${subjectId}`]: newInitials,
    }));
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
        <div className="flex flex-wrap gap-2 mb-0 no-print">
          <select value={filters.term} onChange={e => setFilters(f => ({ ...f, term: e.target.value }))} className="border rounded px-2 py-1">
            <option value="">All Terms</option>
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </select>
          <select value={filters.resultType} onChange={e => setFilters(f => ({ ...f, resultType: e.target.value }))} className="border rounded px-2 py-1">
            <option value="">All Result Types</option>
            {/* Use result_type_name (fallback to results_type) from API */}
            {[...new Set(allResults.map((r:any) => r.result_type_name || r.results_type))].filter(Boolean).map((rt:string) =>
              <option key={rt} value={rt}>{rt}</option>
            )}
          </select>
          <select value={filters.classId} onChange={e => setFilters(f => ({ ...f, classId: e.target.value }))} className="border rounded px-2 py-1">
            <option value="Tahfiz">Tahfiz</option>
            {/* Fallback to class names from results if students list is empty */}
            {[...new Set(
              (allStudents.length ? allStudents.map((s:any)=> s.class_name || s.class_id) : allResults.map((r:any)=> r.class_name))
            )].filter(Boolean).map((cid:string) => {
              const label = allStudents.length
                ? (allStudents.find((s:any)=> (s.class_name || s.class_id) === cid)?.class_name || cid)
                : cid;
              const value = String(cid);
              return <option key={value} value={value}>{label}</option>;
            })}
          </select>
          <input value={filters.student} onChange={e => setFilters(f => ({ ...f, student: e.target.value }))} placeholder="Type student name or ID" className="border rounded px-2 py-1" />
          <label className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded border">
            <input
              type="checkbox"
              checked={enableMarkConversion}
              onChange={(e) => setEnableMarkConversion(e.target.checked)}
              className="form-checkbox h-4 w-4 text-blue-600"
            />
            <span className="text-sm font-medium text-gray-700">Convert Marks (100→40/60)</span>
          </label>
          <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded">Print</button>
          <button onClick={exportToPDF} className="px-4 py-2 bg-green-600 text-white rounded">Export PDF</button>
          <button onClick={exportToExcel} className="px-4 py-2 bg-teal-600 text-white rounded">Export Excel</button>
          <button onClick={() => setShowCustomization(true)} className="px-4 py-2 bg-green-700 text-white rounded">Customize Style</button>
        </div>
        {loading && <div className="no-print">Loading..</div>}
        <div>
          {Object.values(tahfizClassGroupsWithPositions).map((classGroup: any) => (
            <div key={classGroup.className}>
              <div className="classHeading text-2xl font-bold text-center my-0">{classGroup.className}</div>
              {classGroup.students.map((student: any) => {
                const { principal, others } = splitSubjects(student.results || []);
                const groupedResults = groupResultsBySubject(principal);
                const allGroupedResults = groupResultsBySubject([...principal, ...others]); // Include all subjects for display
                
                const isNursery = isNurseryStudent(student.class_name);
                
                const isEndOfTerm = filters.resultType?.toLowerCase().includes('end') || 
                  principal.some((r: any) => (r.result_type_name || r.results_type || '').toLowerCase().includes('end'));

                // Enhanced calculations - only use CORE subjects for grading
                const coreResults = groupedResults.filter(r => 
                  (r.subject_type || 'core').toLowerCase() === 'core'
                );

                const totalMarks = allGroupedResults.reduce((sum, r) => {
                  const { totalMarks } = calculateMarks(r, isEndOfTerm, enableMarkConversion);
                  return sum + totalMarks;
                }, 0);
                
                const coreGradingMarks = coreResults.reduce((sum, r) => {
                  const { totalMarks } = calculateMarks(r, isEndOfTerm, enableMarkConversion);
                  return sum + totalMarks;
                }, 0);
                
                const averageMarks = coreResults.length > 0 ? Math.round(coreGradingMarks / coreResults.length) : 0;
                
                // Calculate aggregates and division/overall grade
                let aggregates = 0;
                let division = '';
                let nurseryOverallGrade = '';

                if (isNursery) {
                  // For Nursery: get overall grade based on mode (core subjects only)
                  const coreGrades = coreResults.map(r => {
                    const { totalMarks } = calculateMarks(r, isEndOfTerm, enableMarkConversion);
                    return getGrade(totalMarks, true);
                  });
                  nurseryOverallGrade = getNurseryOverallGrade(coreGrades);
                } else {
                  // For non-Nursery: calculate traditional aggregates and division (core subjects only)
                  aggregates = coreResults.reduce((sum, r) => {
                    const { totalMarks } = calculateMarks(r, isEndOfTerm, enableMarkConversion);
                    return sum + getGradePoint(getGrade(totalMarks, false));
                  }, 0);
                  division = getDivision(aggregates);
                }

                // Helper to detect Tahfiz-related subjects robustly
                const isTahfizSubject = (name: string = ''): boolean => {
                  const key = (name || '').toLowerCase().replace(/[’'`]/g, "");
                  return /tajweed|mura|muraaja|muraajah|juzu|juz|voice|pronunciation/.test(key);
                };

                // Map combined Tahfiz score to a descriptive grade for the GRADE column
                const getTahfizDescriptiveGrade = (combined: number): string => {
                  if (combined >= 85) return 'Profound';
                  if (combined >= 70) return 'Very Good';
                  if (combined >= 50) return 'Fair';
                  return 'Weak';
                };

                // Calculate Tahfiz-specific metrics
                const calculateTahfizMetrics = (results: Result[]) => {
                  const tahfizScores = results.filter((r: Result) => isTahfizSubject(r.subject_name || r.subject_name || ''));

                  const totalCombinedScore = tahfizScores.reduce((sum: number, r: Result) => sum + (Number(r.score) || 0), 0);

                  let learnerComment = '';
                  if (totalCombinedScore >= 85) {
                    learnerComment = 'Excellent — keep it up.';
                  } else if (totalCombinedScore >= 70) {
                    learnerComment = 'Very good — continue practicing.';
                  } else if (totalCombinedScore >= 50) {
                    learnerComment = 'Unsatisfactory, please see your teacher.';
                  } else {
                    learnerComment = 'Failed, please see your teacher for guidance.';
                  }

                  // Apply the unified comment to all relevant Tahfiz subject results
                  tahfizScores.forEach((r: Result) => {
                    r.comment = learnerComment;
                  });

                  return { totalCombinedScore, learnerComment };
                };

                // Discipline Comment Logic
                const getDisciplineComment = (disciplineScore: number) => {
                  if (disciplineScore >= 90) {
                    return 'Excellent discipline and behavior.';
                  } else if (disciplineScore >= 70) {
                    return 'Generally disciplined with a few minor issues.';
                  } else if (disciplineScore >= 50) {
                    return 'Average discipline; improvement needed.';
                  } else {
                    return 'Poor discipline; requires close monitoring.';
                  }
                };

                // Calculate Tahfiz metrics for the student
                const { totalCombinedScore, learnerComment } = calculateTahfizMetrics(student.results);

                return (
                  <div key={student.student_id} style={styles.reportPage}>
                    {/* Header */}
                    <div style={styles.header}>
                      <div className="text-left ltr:text-left rtl:text-right" style={{ direction: 'ltr', textAlign: 'left', flex: 1 }}>
                        <h2 className="text-xl font-bold">{schoolInfo.name}</h2>
                        <p>{schoolInfo.address}</p>
                        <p>{schoolInfo.contact}</p>
                        <p>{schoolInfo.center_no}</p>
                        <p>{schoolInfo.registration_no}</p>
                      </div>
                      <div className="text-center" style={{ flex: 'none' }}>
                        <Image src={schoolInfo.logo_url} alt="School Logo" width={90} height={90} />
                      </div>
                      <div className="text-right font-bold text-xl rtl:text-right ltr:text-left" style={{ direction: 'rtl', textAlign: 'right', flex: 1 }}>
                        <h1 className="text-xl font-bold">{schoolInfo.arabic_name}</h1>
                        <p>{schoolInfo.arabic_address}</p>
                        <p className="arabic-font">{toArabicDigits(schoolInfo.arabic_contact)}</p>
                        <p className="arabic-font">UNEB: {toArabicDigits(schoolInfo.arabic_center_no)}</p>
                        <p className="arabic-font">Reg: {toArabicDigits(schoolInfo.arabic_registration_no)}</p>
                      </div>
                    </div>
                    {/* Banner */}
                    <div style={styles.blueBanner}>
                      {(principal[0]?.result_type_name || 'MID TERM').toUpperCase()} REPORT
                    </div>
                    {/* Student Info */}
                    <div style={styles.studentInfoBox}>
                      <div style={styles.studentDetails}>
                        <div style={styles.barcodeCard}>
                          <img src={`/api/barcode?id=${student.student_id}`} style={styles.barcodeImg as any} alt="Barcode" />
                          <span style={styles.barcodeVertical}>{student.student_id}</span>
                        </div>
                        <Image
                          src={`${student.photo || '/logo.png'}`}
                          alt={`${student.first_name} ${student.last_name}`}
                          width={100}
                          height={115}
                          style={styles.studentPhoto}
                        />
                        <div>
                          <div style={styles.studentInfoContainer}>
                            <p style={{ margin: 0, padding: 0 }}>
                              <span className="font-bold" style={{ color: '#000' }}>Name:</span>
                              <span style={styles.studentValue}> {student.first_name} {student.last_name}</span>
                            </p>
                            <p style={{ margin: 0, padding: 0 }}>
                              <span className="font-bold" style={{ color: '#000' }}>Gender:</span>
                              <span style={styles.studentValue}> {student.gender || '-'}</span>
                            </p>
                            <p style={{ margin: 0, padding: 0 }}>
                              <span className="font-bold" style={{ color: '#000' }}>Class:</span>
                              <span style={styles.studentValue}> {student.class_name}</span>
                            </p>
                            <p style={{ margin: 0, padding: 0 }}>
                              <span className="font-bold" style={{ color: '#000' }}>Group:</span>
                              <span style={styles.studentValue} contentEditable={true}> {student.group_name || 'A'}</span>
                            </p>
                          </div>
                          <div style={styles.studentInfoContainer}>
                            <p style={{ margin: 0, padding: 0 }}>
                              <span className="font-bold" style={{ color: '#000' }}>Student No:</span>
                              <span style={styles.studentValue}> {student.student_id}</span>
                            </p>
                            <p style={{ margin: 0, padding: 0 }}>
                              <span className="font-bold" style={{ color: '#000' }}>Term:</span>
                              <span 
                                style={{ 
                                  ...styles.studentValue, 
                                  cursor: 'pointer',
                                  borderBottom: isEditingTerm ? '1px solid #000' : 'none',
                                  display: 'inline-block',
                                  minWidth: '80px'
                                }}
                                contentEditable={isEditingTerm}
                                suppressContentEditableWarning
                                onClick={() => setIsEditingTerm(true)}
                                onBlur={(e) => {
                                  setIsEditingTerm(false);
                                  const newValue = e.currentTarget.textContent || '';
                                  setEditableTermValue(newValue);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    setIsEditingTerm(false);
                                    const newValue = e.currentTarget.textContent || '';
                                    setEditableTermValue(newValue);
                                  }
                                }}
                              >
                                {editableTermValue || principal[0]?.term_name || principal[0]?.term || 'Term 1'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Gray Ribbon */}
                    <div style={styles.grayRibbon}>Marks attained in each subject</div>
                    {/* Subjects Table - Display ALL subjects but only core contribute to grading */}
                    <table style={styles.studentTable}>
                      <thead>
                        <tr>
                          <th style={styles.studentTh}>METRIC</th>
                          <th style={styles.studentTh}>SCORE</th>
                          <th style={styles.studentTh}>GRADE</th>
                          <th style={styles.studentTh}>COMMENT</th>
                          <th style={styles.studentTh}>INITIALS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allGroupedResults.map((r: GroupedResult, i: number) => {
                          const { midTermMarks, endTermMarks, totalMarks } = calculateMarks(r, isEndOfTerm, enableMarkConversion);
                          const isCore = (r.subject_type || 'core').toLowerCase() === 'core';
                          
                          const initialsKey = `${student.class_name}-${r.subject_name}`;
                          const currentInitials = teacherInitials[initialsKey] || 
                            r.teacher_name?.split(' ').map((n: string) => n[0]).join('') || 'N/A';

                          // Map grades to descriptive labels
                          const descriptiveGrade = (grade: string): string => {
                            switch (grade) {
                              case 'D1': return 'Profound';
                              case 'D2': return 'Excellent';
                              case 'C3': return 'Very Good';
                              case 'C4': return 'Good';
                              case 'C5': return 'Fair';
                              case 'C6': return 'Poor';
                              case 'P7': return 'Weak';
                              case 'P8': return 'Weak';
                              case 'F9': return 'Weak';
                              default: return 'Weak';
                            }
                          };

                          return (
                            <tr key={i}>
                              <td style={styles.studentTd}>
                                {r.subject_name}
                              </td>
                              <td style={styles.studentTd}>
                                {totalMarks}
                              </td>
                              <td style={{ ...styles.studentTd, color: 'red', fontWeight: 'bold' }}>
                                {isTahfizSubject(r.subject_name) ? getTahfizDescriptiveGrade(totalCombinedScore) : descriptiveGrade(getGrade(totalMarks, isNursery))}
                              </td>
                              <td style={styles.studentTd} className="commentsCell">
                                {isTahfizSubject(r.subject_name) ? learnerComment : commentsForGrade(getGrade(totalMarks, isNursery))}
                              </td>
                              <td
                                style={styles.studentTd}
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => {
                                  const newInitials = e.currentTarget.textContent?.trim() || 'N/A';
                                  handleInitialsChange(student.class_name, r.subject_name, newInitials);
                                  saveInitialsToBackend(student.class_name, r.subject_name, newInitials);
                                }}
                              >
                                {currentInitials}
                              </td>
                            </tr>
                          );
                        })}
                        <tr style={{ fontWeight: 'bold' }}>
                          <td style={styles.studentTd}>TOTAL MARKS:</td>
                          {isEndOfTerm && <td style={styles.studentTd}>{Math.round(allGroupedResults.reduce((sum, r) => sum + (r.midTermScore || 0), 0))}</td>}
                          {isEndOfTerm && <td style={styles.studentTd}>{Math.round(allGroupedResults.reduce((sum, r) => sum + (r.endTermScore || 0), 0))}</td>}
                          <td style={styles.studentTd}></td>
                          <td colSpan={2} style={styles.studentTd}>
                            AVERAGE: {allGroupedResults.length > 0 ? Math.round(totalMarks / allGroupedResults.length) : 0}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    
                    {/* Assessment Section - Modified for Nursery */}
                    {/* <div style={{ marginTop: 20, fontSize: 14 }}>
                      <h3 style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 10 }}>
                        General Assessment
                      </h3>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        padding: '10px 20px', 
                        border: '1px solid #000', 
                        borderRadius: 8 
                      }}>
                        <div>
                          {!isNursery ? (
                            <>
                              <p><strong>Aggregates:</strong> {aggregates}</p>
                              <p><strong>Division:</strong> {division}</p>
                            </>
                          ) : (
                            <p><strong>Overall Grade:</strong> {nurseryOverallGrade}</p>
                          )}
                        </div>
                        <div>
                          <p><strong>Position:</strong> {student.position} out of {student.totalInClass}</p>
                        </div>
                      </div>
                    </div> */}
                    {/* Comments Section */}
                    <div style={styles.comments}>
                      <CommentsSection
                        student={student}
                        division={isNursery ? nurseryOverallGrade : division}
                        nextTermBegins={nextTermBegins}
                        handleNextTermChange={handleNextTermChange}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        
        {/* Customization Modal - Enhanced layout and controls */}
        {showCustomization && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full p-6 relative overflow-y-auto max-h-[90vh]">
              <button className="absolute top-2 right-2 text-2xl" onClick={() => setShowCustomization(false)}>&times;</button>
              <h2 className="text-xl font-bold mb-4">Customize Report Style</h2>
              <div className="mb-4 flex gap-2 border-b">
                <button className={`px-3 py-1 ${customTab==='school'?'border-b-2 border-blue-600 font-semibold':''}`} onClick={()=>setCustomTab('school')}>School</button>
                <button className={`px-3 py-1 ${customTab==='banner'?'border-b-2 border-blue-600 font-semibold':''}`} onClick={()=>setCustomTab('banner')}>Banners</button>
                <button className={`px-3 py-1 ${customTab==='table'?'border-b-2 border-blue-600 font-semibold':''}`} onClick={()=>setCustomTab('table')}>Tables</button>
                <button className={`px-3 py-1 ${customTab==='comment'?'border-b-2 border-blue-600 font-semibold':''}`} onClick={()=>setCustomTab('comment')}>Comments</button>
                <button className={`px-3 py-1 ${customTab==='other'?'border-b-2 border-blue-600 font-semibold':''}`} onClick={()=>setCustomTab('other')}>Other</button>
              </div>
              <form>
                {customTab==='school' && (
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block font-semibold mb-1">School Name</label>
                      <input type="text" className="w-full border rounded px-2 py-1" name="school_name" placeholder="School Name" />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">School Badge/Logo</label>
                      <input type="file" className="w-full border rounded px-2 py-1" name="school_logo_file" accept="image/*" />
                    </div>
                  </div>
                )}
                {/* Add other customization tabs content as needed */}
                <div className="flex justify-end mt-4">
                  <button
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                    type="button"
                    onClick={() => setShowCustomization(false)}
                  >
                    Apply
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        <style jsx global>{`
          .no-print {
            display: block;
          }

          @media print {
            .no-print {
              display: none !important;
            }

            .classHeading,
            button,
            select,
            input,
            label {
              display: none !important;
            }

            html, body {
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
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
const styles = {
  reportPage: {
    pageBreakAfter: 'always',
    background: '#fff',
    boxShadow: '0 2px 8px #e6f0fa',
    padding: '16px 18px',
    borderRadius: 8,
    maxWidth: 900,
    margin: '0 auto 40px',
    fontSize: 14,
    fontFamily: "'Segoe UI', sans-serif",
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    opacity: 0.8,
    marginBottom: 0,
    marginTop: 0,
  } as React.CSSProperties,
  blueBanner: {
    backgroundColor: 'rgb(34, 139, 34)',
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    padding: 8,
    marginTop: 8,
    marginBottom: 4,
  } as React.CSSProperties,
  grayRibbon: {
    position: 'relative',
    background: 'linear-gradient(to right, #d3d3d3, #a9a9a9)',
    color: '#000',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 18,
    padding: 4,
    marginTop: 4,
    marginBottom: 20,
    marginLeft: '15%',
    marginRight: '15%',
    maxWidth: '70%',
    justifyContent: 'center',
  } as React.CSSProperties,
  commentsCell: {
    textAlign: 'left',
    verticalAlign: 'top',
    fontSize: 11,
    padding: '8px',
    fontWeight: 500,
  } as React.CSSProperties,
  studentDetails: {
    display: 'flex',
    gap: 5,
    marginBottom: 2,
    alignItems: 'center',
  } as React.CSSProperties,
  studentPhoto: {
    width: 100,
    height: 115,
    objectFit: 'cover',
    marginRight: 20,
    border: '2px solid #eee',
  } as React.CSSProperties,
  barcodeCard: {
    display: 'flex',
    flexDirection: 'row',
    padding: 0,
    margin: 0,
    gap: 2,
    alignItems: 'center',
  } as React.CSSProperties,
  barcodeImg: {
    width: 90,
    height: 40,
    marginRight: -30,
    marginLeft: -20,
    transform: 'rotate(270deg)',
  } as React.CSSProperties,
  barcodeVertical: {
    fontSize: 15,
    fontWeight: 500,
    margin: 0,
    transform: 'rotate(180deg)',
    writingMode: 'vertical-rl' as any,
  },
  studentInfoContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: '2rem',
    marginBottom: 0,
    paddingBottom: 0,
    borderBottom: '2px dashed #000',
    fontSize: 18,
  } as React.CSSProperties,
  studentValue: {
    color: '#d61515ff',
    fontStyle: 'italic',
    fontWeight: 'bolder',
  } as React.CSSProperties,
  comments: {
    marginTop: 30,
    borderTop: '2px dashed #999',
    paddingTop: 15,
  } as React.CSSProperties,
  commentRibbon: {
    display: 'inline-block',
    position: 'relative',
    background: 'rgb(145, 140, 140)',
    color: '#000',
    fontWeight: 'bold',
    padding: '4px 18px 4px 10px',
    borderRadius: '4px 0 0 4px',
    marginRight: 18,
    marginBottom: 8,
    fontSize: 14,
    borderTopRightRadius: '.4rem',
    borderBottomRightRadius: '.4rem',
  } as React.CSSProperties,
  commentText: {
    color: '#1a4be7',
    fontStyle: 'italic',
    borderBottom: '1.5px dashed #1a4be7',
    textDecoration: 'none',
    display: 'inline',
    marginBottom: 0,
    padding: 0,
  } as React.CSSProperties,
  gradeTable: {
    marginTop: 20,
    width: '100%',
    borderCollapse: 'collapse' as any,
    fontSize: 13,
  },
  gradeTh: {
    background: '#f0f0f0',
    border: '1px solid #04081a',
    textAlign: 'center' as any,
    padding: 6,
  },
  gradeTd: {
    border: '1px solid #04081a',
    textAlign: 'center' as any,
    padding: 6,
  },
  studentTable: {
    borderCollapse: 'collapse' as any,
    width: '100%',
    marginTop: 10,
    fontSize: 14,
  },
  studentTh: {
    border: '1px solid black',
    padding: 6,
    textAlign: 'center' as any,
    background: '#f0f8ff',
  },
  studentTd: {
    border: '1px solid black',
    padding: 6,
    textAlign: 'center' as any,
  },
  studentInfoBox: {
    border: '2px solid #1a4be7',
    borderRadius: 10,
    padding: '18px 16px',
    margin: '18px 0 18px 0',
    background: '#f8faff',
    boxShadow: '0 1px 6px #e6f0fa',
  } as React.CSSProperties,
};

// Enhanced calculation function for marks with conditional conversion
function calculateMarks(groupedResult: GroupedResult, isEndOfTerm: boolean, enableConversion: boolean = false) {
  if (!isEndOfTerm) {
    const raw = groupedResult.regularScore ?? groupedResult.midTermScore ?? groupedResult.endTermScore ?? 0;
    const totalMarks = enableConversion ? Math.round(raw) : Math.round(raw);
    return {
      midTermMarks: Math.round(raw),
      endTermMarks: 0,
      totalMarks: totalMarks
    };
  }

  let midTermMarks = 0;
  let endTermMarks = 0;

  const m = groupedResult.midTermScore;
  const e = groupedResult.endTermScore;
  const r = groupedResult.regularScore;

  if (enableConversion) {
    // Apply conversion ONLY when button is clicked: MT (40→100), EOT (60→100)
    // Assume marks are already out of 100 in database, scale them to 40/60 format
    if (m !== null && e !== null) {
      // Convert 100-based score to 40 and 60 respectively
      midTermMarks = Math.round((m / 100) * 40);
      endTermMarks = Math.round((e / 100) * 60);
    } else if (m !== null && e === null) {
      midTermMarks = Math.round((m / 100) * 40);
      endTermMarks = 0;
    } else if (e !== null && m === null) {
      midTermMarks = 0;
      endTermMarks = Math.round((e / 100) * 60);
    } else if (r !== null) {
      // For regular scores out of 100, split into 40/60
      midTermMarks = Math.round((r / 100) * 40);
      endTermMarks = Math.round((r / 100) * 60);
    }
  } else {
    // NO conversion - show marks out of 100 as stored in database
    if (m !== null && e !== null) {
      midTermMarks = Math.round(m);
      endTermMarks = Math.round(e);
    } else if (m !== null && e === null) {
      midTermMarks = Math.round(m);
      endTermMarks = 0;
    } else if (e !== null && m === null) {
      midTermMarks = 0;
      endTermMarks = Math.round(e);
    } else if (r !== null) {
      // Regular score treated as total out of 100
      midTermMarks = Math.round(r);
      endTermMarks = 0;
    }
  }

  // Total calculation: if converted, add 40+60=100, otherwise sum the raw 100-based scores
  const totalMarks = enableConversion 
    ? (midTermMarks || 0) + (endTermMarks || 0)  // Will be out of 100 (40+60)
    : Math.max(midTermMarks, endTermMarks);  // Take the higher raw score
  
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
}: {
  student: any;
  division: string;
  nextTermBegins: string;
  handleNextTermChange: (newDate: string) => void;
}) {
  const divisionComments = getCommentsByDivision(division);
  
  return (
    <div style={{ marginTop: '1%' }}>
      <div style={{ marginTop: 2 }}>
        <div style={{ marginBottom: 10, width: '100%' }}>
          <span style={styles.commentRibbon}>Class Teacher&apos;s Comment:</span>
          <span style={styles.commentText}>{student.class_teacher_comment || divisionComments.classTeacher}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={styles.commentRibbon}>DOS Comment:</span>
          <span style={styles.commentText}>{student.dos_comment || divisionComments.dos}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={styles.commentRibbon}>Headteacher&apos;s Comment:</span>
          <span style={styles.commentText}>{student.headteacher_comment || divisionComments.headteacher}</span>
        </div>
        <div
          contentEditable
          suppressContentEditableWarning
          style={{ textDecoration: 'underline dashed', marginTop: 12, cursor: 'text' }}
          onBlur={(e) => handleNextTermChange(e.currentTarget.textContent?.trim() || nextTermBegins)}
        >
          {nextTermBegins}
        </div>
      </div>
    </div>
  );
}

// cleaned up stray debug block (removed)
