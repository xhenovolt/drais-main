'use client';
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage
}) => {
  const { t, formatNumber } = useI18n();
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems);

  /**
   * Fixed-width consecutive pagination: Show 5 consecutive page numbers
   * Always shows the same button count - no jumping or expanding
   * Example: [1,2,3,4,5] → [3,4,5,6,7] → [48,49,50,51,52]
   */
  const getVisiblePages = (): number[] => {
    const visibleCount = 5; // Always show exactly 5 consecutive pages
    const halfVisible = Math.floor(visibleCount / 2);
    
    // Calculate range centered on current page
    let start = Math.max(1, currentPage - halfVisible);
    let end = start + visibleCount - 1;
    
    // Adjust if we're near the end
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - visibleCount + 1);
    }
    
    // Build array of consecutive pages
    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  // Handle edge cases
  if (totalPages <= 1) return null;

  const visiblePages = getVisiblePages();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mt-6 px-3 sm:px-4 py-2 sm:py-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
      {/* Results info */}
      <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 order-3 sm:order-1 w-full sm:w-auto text-center sm:text-start">
        {/* One whole sentence per language (word order differs in Arabic), with a short form on phones. */}
        <span className="hidden sm:inline">{t('common.pagination.showing', { from: formatNumber(startIndex), to: formatNumber(endIndex), total: formatNumber(totalItems) })}</span>
        <span className="sm:hidden">{t('common.pagination.showingShort', { from: formatNumber(startIndex), total: formatNumber(totalItems) })}</span>
      </div>

      {/* Pagination controls - Fixed width for mobile stability */}
      <div className="flex items-center gap-1 flex-wrap justify-center sm:justify-start">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrev}
          className="relative inline-flex items-center px-1.5 sm:px-2 py-2 text-sm font-medium text-slate-500 bg-white border border-slate-300 rounded-s-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors duration-200"
          title={t('common.pagination.previousPage')}
          aria-label={t('common.pagination.previousPage')}
        >
          <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 rtl-flip" />
        </button>

        {/* Page numbers - Fixed width 5 consecutive pages */}
        {visiblePages.map((page, index) => (
          <button
            key={index}
            onClick={() => onPageChange(page)}
            className={`relative inline-flex items-center px-2 sm:px-3 py-2 text-sm font-medium border transition-colors duration-200 whitespace-nowrap ${
              currentPage === page
                ? 'z-10 bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-900 dark:border-blue-400 dark:text-blue-300'
                : 'text-slate-500 bg-white border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
            title={t('common.pagination.goToPage', { page })}
            aria-current={currentPage === page ? 'page' : undefined}
          >
            {page}
          </button>
        ))}

        {/* Next button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className="relative inline-flex items-center px-1.5 sm:px-2 py-2 text-sm font-medium text-slate-500 bg-white border border-slate-300 rounded-e-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors duration-200"
          title={t('common.pagination.nextPage')}
          aria-label={t('common.pagination.nextPage')}
        >
          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 rtl-flip" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
