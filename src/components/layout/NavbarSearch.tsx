"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Search, User, MapPin, Loader } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

const API_BASE = '/api';

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  admission_no?: string;
  class_name?: string;
}

interface SystemRoute {
  name: string;
  path: string;
  category: string;
  icon: string;
}

// System routes for page search
const systemRoutes: SystemRoute[] = [
  // Dashboard
  { name: 'Dashboard', path: '/dashboard', category: 'Main', icon: '📊' },
  
  // Students
  { name: 'Students List', path: '/students/list', category: 'Students', icon: '👥' },
  { name: 'Admit Student', path: '/students/admit', category: 'Students', icon: '➕' },
  
  // Staff
  { name: 'Staff List', path: '/staff/list', category: 'Staff', icon: '👔' },
  { name: 'Staff Overview', path: '/staff', category: 'Staff', icon: '📋' },
  
  // Academics
  { name: 'Classes', path: '/academics/classes', category: 'Academics', icon: '🏫' },
  { name: 'Subjects', path: '/academics/subjects', category: 'Academics', icon: '📚' },
  { name: 'Timetable', path: '/academics/timetable', category: 'Academics', icon: '⏰' },
  { name: 'Exams', path: '/academics/exams', category: 'Academics', icon: '✏️' },
  { name: 'Results', path: '/academics/results', category: 'Academics', icon: '📈' },
  
  // Attendance
  { name: 'Attendance', path: '/attendance', category: 'Attendance', icon: '✅' },
  { name: 'Attendance Sessions', path: '/attendance/sessions', category: 'Attendance', icon: '📅' },
  
  // Finance
  { name: 'Finance', path: '/finance/fees', category: 'Finance', icon: '💰' },
  { name: 'Fees', path: '/finance/fees', category: 'Finance', icon: '🧾' },
  { name: 'Payments', path: '/finance/payments', category: 'Finance', icon: '💳' },
  
  // Tahfiz
  { name: 'Tahfiz', path: '/tahfiz', category: 'Tahfiz', icon: '📖' },
  { name: 'Tahfiz Students', path: '/tahfiz/students', category: 'Tahfiz', icon: '📚' },
  
  // Settings
  { name: 'Settings', path: '/settings', category: 'Settings', icon: '⚙️' },
  { name: 'Theme', path: '/settings/theme', category: 'Settings', icon: '🎨' },
];

interface SearchResult {
  type: 'student' | 'route';
  data: Student | SystemRoute;
}

export const NavbarSearch: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Search students from database
  const searchStudents = async (query: string): Promise<Student[]> => {
    if (!query.trim()) return [];
    
    try {
      const response = await fetch(
        `${API_BASE}/students/full?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      return Array.isArray(data?.data) ? data.data : [];
    } catch (error) {
      console.error('Error searching students:', error);
      return [];
    }
  };

  // Search system routes
  const searchRoutes = (query: string): SystemRoute[] => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    return systemRoutes.filter(
      route =>
        route.name.toLowerCase().includes(lowerQuery) ||
        route.category.toLowerCase().includes(lowerQuery)
    );
  };

  // Combined search
  useEffect(() => {
    const performSearch = async () => {
      if (!searchTerm.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      
      try {
        // Search students first
        const students = await searchStudents(searchTerm);
        const studentResults: SearchResult[] = students.map(s => ({
          type: 'student',
          data: s
        }));

        // If students found, show them; otherwise show routes
        if (studentResults.length > 0) {
          setResults(studentResults.slice(0, 8)); // Limit to 8 results
        } else {
          // Search routes as fallback
          const routes = searchRoutes(searchTerm);
          const routeResults: SearchResult[] = routes.map(r => ({
            type: 'route',
            data: r
          }));
          setResults(routeResults.slice(0, 8));
        }
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(performSearch, 300); // Debounce
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleResultClick = (result: SearchResult) => {
    const path = result.type === 'student'
      ? `/students/${(result.data as Student).id}`
      : (result.data as SystemRoute).path;
    
    router.push(path);
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search students or navigate..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={clsx(
            "w-full pl-10 rtl:pl-4 rtl:pr-10 pr-4 py-2 rounded-xl",
            "bg-gray-100 dark:bg-slate-800 border-0",
            "focus:ring-2 focus:ring-[var(--color-primary)] focus:bg-white dark:focus:bg-slate-700",
            "transition-all placeholder-gray-500 dark:placeholder-gray-400",
            "text-sm"
          )}
        />
        {isLoading && (
          <Loader className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Search Results Dropdown */}
      <AnimatePresence>
        {isOpen && searchTerm.trim() && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className={clsx(
              "absolute top-full mt-2 w-full",
              "bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700",
              "rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto"
            )}
          >
            {results.length === 0 && !isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No students or pages found
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* Student Results */}
                {results.some(r => r.type === 'student') && (
                  <div>
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                      Students
                    </div>
                    {results
                      .filter(r => r.type === 'student')
                      .map((result, idx) => {
                        const student = result.data as Student;
                        return (
                          <button
                            key={`student-${idx}`}
                            onClick={() => handleResultClick(result)}
                            className={clsx(
                              "w-full text-left px-4 py-3 flex items-center gap-3",
                              "hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors",
                              "border-none cursor-pointer"
                            )}
                          >
                            <User className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {student.first_name} {student.last_name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {student.admission_no && `Adm: ${student.admission_no}`}
                                {student.class_name && ` • ${student.class_name}`}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Route Results */}
                {results.some(r => r.type === 'route') && (
                  <div>
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                      Pages
                    </div>
                    {results
                      .filter(r => r.type === 'route')
                      .map((result, idx) => {
                        const route = result.data as SystemRoute;
                        return (
                          <button
                            key={`route-${idx}`}
                            onClick={() => handleResultClick(result)}
                            className={clsx(
                              "w-full text-left px-4 py-3 flex items-center gap-3",
                              "hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors",
                              "border-none cursor-pointer"
                            )}
                          >
                            <span className="text-lg flex-shrink-0">{route.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {route.name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {route.category}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NavbarSearch;
