import React from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface AlphabeticalFilterProps {
  selectedLetter: string | null;
  onLetterChange: (letter: string | null) => void;
  studentCount?: number;
}

/**
 * Alphabetical Quick Filter A-Z Navigation
 * Allows filtering students by first letter of their name
 * Works in combination with search and other filters
 */
export const AlphabeticalFilter: React.FC<AlphabeticalFilterProps> = ({
  selectedLetter,
  onLetterChange,
  studentCount = 0,
}) => {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Quick Filter by Name
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Click a letter to filter learners by first name
          </p>
        </div>
        {selectedLetter && (
          <button
            onClick={() => onLetterChange(null)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Alphabet buttons */}
      <div className="flex flex-wrap gap-1.5 p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
        {/* All button */}
        <button
          onClick={() => onLetterChange(null)}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
            !selectedLetter
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
          )}
        >
          All
        </button>

        {/* Letter buttons */}
        {ALPHABET.map((letter) => (
          <button
            key={letter}
            onClick={() => onLetterChange(letter)}
            className={clsx(
              'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-w-[2.5rem]',
              selectedLetter === letter
                ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md scale-105'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
            )}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Active filter indicator */}
      {selectedLetter && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
          <span className="text-xs text-blue-700 dark:text-blue-300">
            Showing learners starting with <strong>{selectedLetter}</strong>
            {studentCount > 0 && <span> ({studentCount})</span>}
          </span>
        </div>
      )}
    </div>
  );
};

export default AlphabeticalFilter;
