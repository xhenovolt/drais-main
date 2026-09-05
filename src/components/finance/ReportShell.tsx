'use client';

/**
 * Shared chrome for the finance statements (income statement, balance sheet).
 *
 * These are the documents a director shows a board, so they must (a) state the
 * period they cover, (b) print cleanly onto A4, and (c) never render a figure
 * without saying where it came from. The print stylesheet drops the app chrome
 * so a printed statement is a financial document, not a screenshot.
 */

import React from 'react';
import { Printer, Loader2, AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';

export function ReportShell({
  title, subtitle, periodLabel, onPrint, children, actions,
}: {
  title: string;
  subtitle?: string;
  periodLabel?: string;
  onPrint?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { school } = useSchoolConfig();
  const print = onPrint ?? (() => window.print());

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 print:bg-white">
      <style>{`@media print {
        .no-print { display: none !important; }
        .sheet { box-shadow: none !important; border: none !important; margin: 0 !important; }
        @page { size: A4; margin: 14mm; }
      }`}</style>

      <div className="max-w-6xl mx-auto px-4 py-6 print:p-0">
        {/* Toolbar — screen only */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={print}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        <div className="sheet bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 print:p-0">
          {/* Statement header — printed */}
          <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-5 mb-6">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {school?.name ?? 'School'}
            </h2>
            {school?.address && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{school.address}</p>
            )}
            <p className="text-base font-bold text-slate-800 dark:text-slate-200 mt-3">{title}</p>
            {periodLabel && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{periodLabel}</p>
            )}
          </div>

          {children}

          <p className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-600 text-center">
            Generated from recorded transactions on {new Date().toLocaleString()}. Figures are derived, not
            manually entered.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ReportLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin" />
      <p className="text-sm">Building statement from transactions…</p>
    </div>
  );
}

export function ReportError({
  message, onRetry, accessDenied,
}: { message?: string; onRetry?: () => void; accessDenied?: boolean }) {
  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
        <ShieldAlert className="w-8 h-8 text-amber-500" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Access denied</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
          Your account does not have permission to view this statement. Ask a school administrator to grant you
          finance reports access.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
      <AlertTriangle className="w-8 h-8 text-amber-500" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Could not build this statement
      </p>
      {message && <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}

/** A statement line. `emphasis` promotes subtotals and totals. */
export function Line({
  label, value, emphasis = 'normal', hint, indent = 0,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  emphasis?: 'normal' | 'subtotal' | 'total' | 'muted';
  hint?: string;
  indent?: number;
}) {
  const cls = {
    normal:   'text-sm text-slate-700 dark:text-slate-300',
    muted:    'text-sm text-slate-500 dark:text-slate-500',
    subtotal: 'text-sm font-semibold text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-800 pt-2 mt-1',
    total:    'text-base font-extrabold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700 pt-2.5 mt-1.5',
  }[emphasis];

  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 ${cls}`}>
      <span style={{ paddingLeft: indent * 16 }} className="min-w-0">
        {label}
        {hint && <span className="block text-[11px] text-slate-400 dark:text-slate-600 font-normal">{hint}</span>}
      </span>
      <span className="tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-6 mb-2">
      {children}
    </h3>
  );
}
