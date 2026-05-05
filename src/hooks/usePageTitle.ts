import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/students': 'Students',
  '/students/list': 'Student List',
  '/students/enrollments': 'Student Enrollments',
  '/students/requirements': 'Student Requirements',
  '/students/contacts': 'Student Contacts',
  '/students/documents': 'Student Documents',
  '/students/history': 'Academic History',
  '/attendance': 'Student Attendance',
  '/staff': 'Staff',
  '/staff/list': 'Staff List',
  '/staff/add': 'Add Staff',
  '/staff/attendance': 'Staff Attendance',
  '/departments': 'Departments',
  '/departments/workplans': 'Work Plans',
  '/academics': 'Academics',
  '/academics/classes': 'Classes',
  '/academics/streams': 'Streams',
  '/academics/subjects': 'Subjects',
  '/academics/class-subjects': 'Class Subjects',
  '/academics/timetable': 'Timetable',
  '/academics/years': 'Academic Years',
  '/academics/curriculums': 'Curriculums',
  '/academics/exams': 'Exams',
  '/academics/results': 'Results',
  '/academics/reports': 'Reports (Legacy)',
  '/academics/report-cards': 'Report Cards',
  '/academics/report-cards/secular': 'Secular Report Cards',
  '/academics/report-cards/theology': 'Theology Report Cards',
  '/terms/list': 'Terms',
  '/tahfiz': 'Tahfiz Overview',
  '/tahfiz/students': 'Tahfiz Students',
  '/tahfiz/records': 'Tahfiz Records',
  '/tahfiz/books': 'Tahfiz Books',
  '/tahfiz/portions': 'Tahfiz Portions',
  '/tahfiz/groups': 'Tahfiz Groups',
  '/tahfiz/attendance': 'Tahfiz Attendance',
  '/tahfiz/plans': 'Learning Plans',
  '/tahfiz/reports': 'Tahfiz Reports',
  // Add more routes as needed...
};

export function usePageTitle(customTitle?: string) {
  const pathname = usePathname();
  
  useEffect(() => {
    let title = 'DRAIS';
    
    if (customTitle) {
      title = `${customTitle} - DRAIS`;
    } else if (routeTitles[pathname]) {
      title = `${routeTitles[pathname]} - DRAIS`;
    } else {
      // Fallback: convert pathname to title
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const pageTitle = segments[segments.length - 1]
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        title = `${pageTitle} - DRAIS`;
      }
    }
    
    document.title = title;
  }, [pathname, customTitle]);
}
