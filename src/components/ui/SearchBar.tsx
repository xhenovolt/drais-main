'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ArrowRight, X } from 'lucide-react';

interface SearchResult {
  type: 'student' | 'class' | 'academicYear' | 'result' | 'report' | 'user';
  label: string;
  id: number;
  subtitle?: string;
}

/**
 * GLOBAL SYSTEM-WIDE SEARCH BAR
 * 
 * FEATURES:
 * - Debounced search (300ms)
 * - Grouped results by type
 * - Limit 10 results per category
 * - Click to navigate
 * - Keyboard accessible (Esc to close)
 * - Mobile: Icon only, tap for full-screen modal
 * - Desktop: Inline search bar
 */

export const SearchBar: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search API call with debounce
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(-1);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);

    // Navigate based on type
    const routes: Record<string, (id: number) => string> = {
      student: (id) => `/students/list?focus=${id}`,
      class: (id) => `/academics/classes?id=${id}`,
      academicYear: (id) => `/academics/years?id=${id}`,
      result: (id) => `/results?id=${id}`,
      report: (id) => `/reports/${id}`,
      user: (id) => `/users/${id}`,
    };

    const route = routes[result.type]?.(result.id);
    if (route) {
      router.push(route);
    }
  };

  // Group results by type
  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const typeLabels: Record<string, string> = {
    student: 'Students',
    class: 'Classes',
    academicYear: 'Academic Years',
    result: 'Results',
    report: 'Reports',
    user: 'Users',
  };

  // MOBILE VIEW: Icon only
  if (isMobile) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Search"
        >
          <Search size={20} className="text-gray-700 dark:text-gray-300" />
        </button>

        {/* Mobile Full-Screen Modal */}
        {isOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search students, classes, results..."
                  value={query}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setQuery('');
                    setResults([]);
                  }}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-blue-500" />
                </div>
              ) : results.length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(groupedResults).map(([type, typeResults]) => (
                    <div key={type}>
                      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {typeLabels[type] || type}
                      </div>
                      {(typeResults as SearchResult[]).map((result, idx) => (
                        <button
                          key={`${type}-${result.id}`}
                          onClick={() => handleSelectResult(result)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {result.label}
                            </div>
                            {result.subtitle && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {result.subtitle}
                              </div>
                            )}
                          </div>
                          <ArrowRight size={16} className="text-gray-400 dark:text-gray-500" />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : query && !loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <Search size={32} className="text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">No results for "{query}"</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <Search size={32} className="text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Search students, classes, academic years, results, reports, and users
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // DESKTOP VIEW: Inline search bar
  return (
    <div className="relative flex-1 max-w-md" ref={searchRef}>
      {/* Search Input */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search anything..."
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm rounded-lg

 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (results.length > 0 || loading || query) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-blue-500" />
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {Object.entries(groupedResults).map(([type, typeResults]) => (
                <div key={type}>
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400 sticky top-0">
                    {typeLabels[type] || type}
                  </div>
                  {(typeResults as SearchResult[]).map((result, idx) => (
                    <button
                      key={`${type}-${result.id}`}
                      onClick={() => handleSelectResult(result)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                        selectedIndex === results.indexOf(result)
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="truncate">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {result.label}
                        </div>
                        {result.subtitle && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {result.subtitle}
                          </div>
                        )}
                      </div>
                      <ArrowRight size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : query && !loading ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No results for "{query}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
