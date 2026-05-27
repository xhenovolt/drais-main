"use client";
/** A search-box-styled button that opens the global command palette. */
import React from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';

function openPalette() {
  window.dispatchEvent(new Event('drais:open-search'));
}

export const CommandSearchTrigger: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  return (
    <button
      onClick={openPalette}
      className={clsx(
        'w-full flex items-center gap-3 pl-10 pr-3 py-2 rounded-xl relative text-left',
        'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200/70 dark:hover:bg-slate-700',
        'transition-colors text-sm text-gray-500 dark:text-gray-400',
      )}
      aria-label="Open search"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <span className="flex-1 truncate">Search…</span>
      {!isMobile && (
        <kbd className="text-[10px] font-medium border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">⌘K</kbd>
      )}
    </button>
  );
};

export default CommandSearchTrigger;
