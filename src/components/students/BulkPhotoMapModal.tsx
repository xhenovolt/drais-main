'use client';
/**
 * BulkPhotoMapModal
 * Shows auto-matched count via ProgressOverlay, then presents pending
 * (< 90% confidence) matches for manual review.
 */
import React, { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { useProgress } from '@/contexts/ProgressContext';

interface AutoMatch {
  person_id: number;
  name: string;
  photo_url: string;
  file_name: string;
  score: number;
}

interface PendingMatch {
  file_name: string;
  buffer_b64: string;
  mime_type: string;
  topMatch: { person_id: number; name: string; score: number } | null;
}

interface Student {
  person_id: number;
  full_name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** All students in the school — for dropdown override */
  allStudents: Student[];
}

export default function BulkPhotoMapModal({ isOpen, onClose, allStudents }: Props) {
  const { startProgress, updateProgress, incrementSuccess, incrementError, finishProgress, setProgressError } = useProgress();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [autoMatched,    setAutoMatched]    = useState<AutoMatch[]>([]);
  const [overrides,      setOverrides]      = useState<Record<string, number>>({}); // file_name → person_id
  const [confirmedSet,   setConfirmedSet]   = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'idle' | 'review' | 'done'>('idle');

  // ── Step 1: Upload & auto-match ────────────────────────────────────────────
  const handleUpload = useCallback(async (files: FileList) => {
    if (!files.length) return;

    startProgress(`Analysing ${files.length} photo(s)…`);
    setPhase('idle');
    setPendingMatches([]);
    setAutoMatched([]);
    setConfirmedSet(new Set());

    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('photos', f));

      updateProgress(10, 'Uploading to server…');
      const res  = await fetch('/api/students/bulk-photo-map', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setProgressError(data.error ?? 'Server error');
        return;
      }

      updateProgress(80, `Auto-matched ${data.summary.auto} of ${data.summary.total}`);

      for (let i = 0; i < data.autoMatched.length; i++) incrementSuccess();
      for (let i = 0; i < data.failed.length;      i++) incrementError();

      setAutoMatched(data.autoMatched);
      setPendingMatches(data.pendingMatches);

      updateProgress(100, 'Done');
      finishProgress();

      setPhase(data.pendingMatches.length > 0 ? 'review' : 'done');
    } catch (err: any) {
      setProgressError(err.message ?? 'Unknown error');
    }
  }, [startProgress, updateProgress, incrementSuccess, incrementError, finishProgress, setProgressError]);

  // ── Step 2: Confirm individual pending match ───────────────────────────────
  const confirmMatch = useCallback(async (pm: PendingMatch) => {
    const personId = overrides[pm.file_name] ?? pm.topMatch?.person_id;
    if (!personId) {
      alert('Please select a student before confirming.');
      return;
    }

    startProgress(`Uploading ${pm.file_name}…`);
    try {
      const res = await fetch('/api/students/bulk-photo-map', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id:  personId,
          buffer_b64: pm.buffer_b64,
          mime_type:  pm.mime_type,
          file_name:  pm.file_name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setProgressError(data.error ?? 'Server error'); return; }

      incrementSuccess();
      updateProgress(100, 'Confirmed');
      finishProgress();

      setConfirmedSet(prev => new Set(prev).add(pm.file_name));
    } catch (err: any) {
      setProgressError(err.message ?? 'Upload failed');
    }
  }, [overrides, startProgress, updateProgress, incrementSuccess, finishProgress, setProgressError]);

  const unconfirmedCount = pendingMatches.filter(pm => !confirmedSet.has(pm.file_name)).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bulk Photo Upload</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Upload zone */}
          {phase === 'idle' && (
            <div
              className="border-2 border-dashed border-indigo-300 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-indigo-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
            >
              <span className="text-4xl">📁</span>
              <p className="text-gray-600 dark:text-gray-300 text-sm text-center">
                Drop a folder of photos here, or <span className="text-indigo-600 underline">browse</span>
              </p>
              <p className="text-gray-400 text-xs">JPEG / PNG / WebP · max 10 MB each · filenames should contain student names</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => e.target.files && handleUpload(e.target.files)}
              />
            </div>
          )}

          {/* Auto-match summary */}
          {(phase === 'review' || phase === 'done') && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl p-4">
              <p className="text-emerald-800 dark:text-emerald-300 font-medium">
                ✓ {autoMatched.length} photo{autoMatched.length !== 1 ? 's' : ''} automatically matched and uploaded
              </p>
            </div>
          )}

          {/* Pending review list */}
          {phase === 'review' && pendingMatches.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-800 dark:text-gray-200 text-sm uppercase tracking-wide">
                Manual Review — {unconfirmedCount} remaining
              </h3>
              {pendingMatches.map(pm => (
                <div
                  key={pm.file_name}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                    confirmedSet.has(pm.file_name)
                      ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700">
                    <img
                      src={`data:${pm.mime_type};base64,${pm.buffer_b64}`}
                      alt={pm.file_name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{pm.file_name}</p>
                    {pm.topMatch && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        Best match: <strong>{pm.topMatch.name}</strong> ({pm.topMatch.score}%)
                      </p>
                    )}
                    <select
                      className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      value={overrides[pm.file_name] ?? pm.topMatch?.person_id ?? ''}
                      onChange={e => setOverrides(prev => ({ ...prev, [pm.file_name]: Number(e.target.value) }))}
                      disabled={confirmedSet.has(pm.file_name)}
                    >
                      <option value="">— Select student —</option>
                      {allStudents.map(s => (
                        <option key={s.person_id} value={s.person_id}>{s.full_name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => !confirmedSet.has(pm.file_name) && confirmMatch(pm)}
                    disabled={confirmedSet.has(pm.file_name)}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      confirmedSet.has(pm.file_name)
                        ? 'bg-emerald-100 text-emerald-700 cursor-default'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {confirmedSet.has(pm.file_name) ? '✓ Done' : 'Confirm'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* All done */}
          {phase === 'done' && pendingMatches.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">All photos were matched automatically.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          {phase === 'review' && (
            <button
              onClick={() => fileInputRef.current && (fileInputRef.current.value = '') && setPhase('idle') as any}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Upload More
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
