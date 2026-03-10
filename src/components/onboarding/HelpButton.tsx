"use client";
/**
 * PHASE 23 — CONTEXTUAL HELP BUTTONS
 * Small "?" icon button that shows a contextual explanation popover on click.
 *
 * Usage:
 *   <HelpButton text="Attendance records show when each student arrives or leaves." />
 *   <HelpButton text="..." title="About Fingerprint Enrolment" docsHref="/documentation/attendance" />
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface HelpButtonProps {
  text: string;
  title?: string;
  docsHref?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export default function HelpButton({
  text,
  title,
  docsHref,
  side = 'top',
  className = '',
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const popoverPosition: Record<string, string> = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div ref={ref} className={`relative inline-flex items-center ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-5 h-5 rounded-full bg-gray-200 hover:bg-indigo-200 dark:bg-gray-700 dark:hover:bg-indigo-700 flex items-center justify-center transition-colors group"
        aria-label="Help"
      >
        <HelpCircle className="w-3.5 h-3.5 text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 ${popoverPosition[side]}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              {title && (
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{title}</p>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Explanation */}
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{text}</p>

            {/* Docs link */}
            {docsHref && (
              <Link
                href={docsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                onClick={() => setOpen(false)}
              >
                Read documentation
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
