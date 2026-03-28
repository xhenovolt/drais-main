'use client';
/**
 * ProgressOverlay — Full-screen modal overlay for all long operations.
 * Renders when ProgressContext.isActive === true.
 *
 * Shows:
 *  • Animated progress bar
 *  • Live ticker text (current task / item being processed)
 *  • Success / Failed counters
 *  • Close button (only when finished)
 */
import React from 'react';
import { CheckCircle2, XCircle, Loader2, X, AlertTriangle } from 'lucide-react';
import { useProgress } from '@/contexts/ProgressContext';

export default function ProgressOverlay() {
  const { state, resetProgress } = useProgress();

  if (!state.isActive) return null;

  const barColor = state.hasError
    ? 'bg-red-500'
    : state.isFinished
    ? state.errorCount > 0
      ? 'bg-amber-500'
      : 'bg-emerald-500'
    : 'bg-indigo-500';

  const borderColor = state.hasError
    ? 'border-red-200 dark:border-red-800'
    : state.isFinished
    ? state.errorCount > 0
      ? 'border-amber-200 dark:border-amber-800'
      : 'border-emerald-200 dark:border-emerald-800'
    : 'border-indigo-200 dark:border-indigo-800';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Operation progress"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card */}
      <div
        className={`relative w-full max-w-md mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 ${borderColor} overflow-hidden`}
      >
        {/* Header strip */}
        <div
          className={`h-1.5 w-full transition-all duration-300 ease-out ${barColor}`}
          style={{ width: `${state.progress}%` }}
        />

        <div className="p-6 space-y-5">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!state.isFinished ? (
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin flex-shrink-0" />
              ) : state.hasError ? (
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              ) : state.errorCount > 0 ? (
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              )}
              <h2 className="text-base font-semibold text-slate-800 dark:text-white">
                {state.isFinished ? 'Operation Complete' : 'Processing…'}
              </h2>
            </div>

            {/* Close only when finished */}
            {state.isFinished && (
              <button
                onClick={resetProgress}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Progress</span>
              <span className="font-mono font-semibold">{Math.round(state.progress)}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>

          {/* Live ticker */}
          <div className="min-h-[2.5rem] flex items-center">
            <p className="text-sm text-slate-600 dark:text-slate-300 truncate leading-snug">
              {state.currentTask || (state.isFinished ? 'All done.' : 'Preparing…')}
            </p>
          </div>

          {/* Counters row */}
          {(state.successCount > 0 || state.errorCount > 0) && (
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {state.successCount}
                </span>
                <span className="text-slate-500 dark:text-slate-400">succeeded</span>
              </div>
              {state.errorCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="font-semibold text-red-700 dark:text-red-400">
                    {state.errorCount}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">failed</span>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {state.hasError && state.errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                {state.errorMessage}
              </p>
            </div>
          )}

          {/* Dismiss when done */}
          {state.isFinished && (
            <button
              onClick={resetProgress}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
