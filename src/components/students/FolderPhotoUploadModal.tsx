"use client";
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FolderOpen, Check, Upload, Search,
  Edit2, SkipForward, Loader2, CheckCircle2, XCircle,
  AlertTriangle, ArrowRight, RefreshCw,
} from 'lucide-react';
import Swal from 'sweetalert2';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FolderMatchStudent {
  id: number;
  person_id?: number;
  first_name: string;
  last_name: string;
  admission_no?: string;
  photo_url?: string;
  class_name?: string;
}

type Confidence = 'high' | 'medium' | 'low' | 'none';

interface MatchResult {
  uid: string;
  file: File;
  previewUrl: string;
  fileDisplayName: string;
  matchedStudent: FolderMatchStudent | null;
  confidence: Confidence;
  skip: boolean;
  ambiguous: boolean;
  ambiguousCandidates: FolderMatchStudent[];
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error';
  uploadError?: string;
  newPhotoUrl?: string;
}

type Step = 'select' | 'reviewing' | 'uploading' | 'done';

export interface FolderPhotoUploadModalProps {
  open: boolean;
  onClose: () => void;
  students: FolderMatchStudent[];
  onUploadComplete: (updated: Record<number, string>) => void;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_\-]/g, ' ');
}

const IMAGE_EXTS = /\.(jpe?g|png|webp|gif|bmp|heic|heif|tiff?)$/i;

type Candidate = {
  student: FolderMatchStudent;
  full: string;
  reversed: string;
  first: string;
  last: string;
};

function buildMatches(files: File[], students: FolderMatchStudent[]): MatchResult[] {
  const candidates: Candidate[] = students.map(s => ({
    student: s,
    full: normalize(`${s.first_name} ${s.last_name}`),
    reversed: normalize(`${s.last_name} ${s.first_name}`),
    first: normalize(s.first_name),
    last: normalize(s.last_name),
  }));

  return files
    .filter(f => IMAGE_EXTS.test(f.name))
    .map((file, i) => {
      const base = stripExtension(file.name);
      const norm = normalize(base);
      const previewUrl = URL.createObjectURL(file);
      const uid = `${i}-${file.name}`;

      const make = (
        student: FolderMatchStudent | null,
        confidence: Confidence,
        ambiguous = false,
        ambiguousCandidates: FolderMatchStudent[] = [],
      ): MatchResult => ({
        uid, file, previewUrl, fileDisplayName: base,
        matchedStudent: student, confidence,
        skip: confidence === 'none' && !ambiguous,
        ambiguous, ambiguousCandidates,
        uploadStatus: 'pending',
      });

      // STEP 1 — Exact full name or reversed
      const exactFull = candidates.filter(c => c.full === norm);
      const exactRev  = candidates.filter(c => c.reversed === norm);
      const exact     = exactFull.length ? exactFull : exactRev;
      if (exact.length === 1) return make(exact[0].student, 'high');
      if (exact.length > 1)  return make(null, 'none', true, exact.map(e => e.student));

      // STEP 2 — Both first+last name present anywhere in filename
      const both = candidates.filter(c =>
        c.first.length > 2 && c.last.length > 2 &&
        norm.includes(c.first) && norm.includes(c.last)
      );
      if (both.length === 1) return make(both[0].student, 'medium');
      if (both.length > 1)  return make(null, 'none', true, both.map(b => b.student));

      // STEP 3 — Last name only (must be long enough to be distinctive)
      const byLast = candidates.filter(c => c.last.length > 3 && norm.includes(c.last));
      if (byLast.length === 1) return make(byLast[0].student, 'low');

      // No match → auto-skip
      return make(null, 'none');
    });
}

// ─── Confidence styles ────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  low:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  none:   'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High', medium: 'Medium', low: 'Low', none: 'No match',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function FolderPhotoUploadModal({
  open, onClose, students, onUploadComplete,
}: FolderPhotoUploadModalProps) {
  const [step, setStep]              = useState<Step>('select');
  const [matches, setMatches]        = useState<MatchResult[]>([]);
  const [classFilter, setClassFilter] = useState<string>('');
  const [editingUid, setEditingUid]  = useState<string | null>(null);
  const [editSearch, setEditSearch]  = useState('');
  const [dragOver, setDragOver]      = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef  = useRef<HTMLInputElement>(null);
  const cancelRef      = useRef(false);

  // Unique class list
  const classList = Array.from(
    new Set(students.filter(s => s.class_name).map(s => s.class_name!))
  ).sort();

  // Students scoped to class filter
  const scopedStudents = classFilter
    ? students.filter(s => s.class_name === classFilter)
    : students;

  // ── Derived stats ──────────────────────────────────────────────────────────
  const highC    = matches.filter(m => m.confidence === 'high'   && !m.skip).length;
  const mediumC  = matches.filter(m => m.confidence === 'medium' && !m.skip).length;
  const lowC     = matches.filter(m => m.confidence === 'low'    && !m.skip).length;
  const noMatchC = matches.filter(m => (m.confidence === 'none' || !m.matchedStudent) && !m.skip).length;
  const skippedC = matches.filter(m => m.skip).length;
  const ready    = matches.filter(m => !m.skip && m.matchedStudent && m.confidence !== 'none').length;

  const uploadTotal   = matches.filter(m => !m.skip && m.matchedStudent && m.confidence !== 'none').length;
  const uploadDone    = matches.filter(m => m.uploadStatus === 'success' || m.uploadStatus === 'error').length;
  const uploadSuccess = matches.filter(m => m.uploadStatus === 'success').length;
  const uploadFailed  = matches.filter(m => m.uploadStatus === 'error').length;
  const uploadPct     = uploadTotal > 0 ? Math.round((uploadDone / uploadTotal) * 100) : 0;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const ingestFiles = (files: File[]) => {
    matches.forEach(m => { try { URL.revokeObjectURL(m.previewUrl); } catch {} });
    const newMatches = buildMatches(files, scopedStudents);
    if (!newMatches.length) {
      Swal.fire({
        title: 'No images found',
        text: 'No supported image files were found in the selection.',
        icon: 'warning',
        customClass: { popup: 'rounded-2xl' },
      });
      return;
    }
    setMatches(newMatches);
    setStep('reviewing');
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) ingestFiles(files);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files: File[] = [];
    if (e.dataTransfer.items) {
      for (const item of Array.from(e.dataTransfer.items)) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    } else {
      files.push(...Array.from(e.dataTransfer.files));
    }
    if (files.length) ingestFiles(files);
  };

  const toggleSkip = (uid: string) =>
    setMatches(prev => prev.map(m => m.uid === uid ? { ...m, skip: !m.skip } : m));

  const reassign = (uid: string, student: FolderMatchStudent | null) => {
    setMatches(prev => prev.map(m =>
      m.uid === uid
        ? { ...m, matchedStudent: student, confidence: student ? 'high' : 'none', ambiguous: false, skip: !student }
        : m
    ));
    setEditingUid(null);
    setEditSearch('');
  };

  const skipAllUnmatched = () =>
    setMatches(prev => prev.map(m =>
      m.confidence === 'none' || !m.matchedStudent ? { ...m, skip: true } : m
    ));

  const skipAllLow = () =>
    setMatches(prev => prev.map(m => m.confidence === 'low' ? { ...m, skip: true } : m));

  const runUpload = async () => {
    const toUpload = matches.filter(m => !m.skip && m.matchedStudent && m.confidence !== 'none');
    cancelRef.current = false;
    setStep('uploading');
    const updatedPhotos: Record<number, string> = {};

    for (const match of toUpload) {
      if (cancelRef.current) break;

      setMatches(prev =>
        prev.map(m => m.uid === match.uid ? { ...m, uploadStatus: 'uploading' } : m)
      );

      try {
        const fd = new FormData();
        fd.append('photos', match.file);
        if (match.matchedStudent!.person_id) {
          fd.append('person_ids', String(match.matchedStudent!.person_id));
        } else {
          fd.append('student_ids', String(match.matchedStudent!.id));
        }

        const res = await fetch('/api/students/bulk-photo-upload', { method: 'POST', body: fd });
        const json = await res.json();

        if (json.success && json.results?.[0]?.photo_url) {
          const photoUrl: string = json.results[0].photo_url;
          updatedPhotos[match.matchedStudent!.id] = photoUrl;
          setMatches(prev =>
            prev.map(m => m.uid === match.uid ? { ...m, uploadStatus: 'success', newPhotoUrl: photoUrl } : m)
          );
        } else {
          throw new Error(json.results?.[0]?.error || json.error || 'Upload failed');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setMatches(prev =>
          prev.map(m => m.uid === match.uid ? { ...m, uploadStatus: 'error', uploadError: message } : m)
        );
      }
    }

    setStep('done');
    onUploadComplete(updatedPhotos);
  };

  const handleClose = () => {
    if (step === 'uploading') cancelRef.current = true;
    matches.forEach(m => { try { URL.revokeObjectURL(m.previewUrl); } catch {} });
    setMatches([]);
    setStep('select');
    setClassFilter('');
    setEditingUid(null);
    setEditSearch('');
    onClose();
  };

  // Student list for the inline reassign search
  const editSearchResults = editSearch.trim()
    ? scopedStudents.filter(s =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(editSearch.toLowerCase()) ||
        s.admission_no?.toLowerCase().includes(editSearch.toLowerCase())
      ).slice(0, 30)
    : scopedStudents.slice(0, 20);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.22 }}
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-slate-700 dark:to-slate-650 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                Folder Photo Upload
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Auto-match photos by filename → review → upload
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Step breadcrumbs */}
            <div className="hidden sm:flex items-center gap-1 text-xs">
              {(['select', 'reviewing', 'uploading', 'done'] as Step[]).map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />}
                  <span className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                    step === s
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {['Select', 'Review', 'Upload', 'Done'][i]}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors text-gray-500 dark:text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">

          {/* ══ STEP: SELECT ══════════════════════════════════════════════════ */}
          {step === 'select' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">

              {/* Class filter */}
              {classList.length > 0 && (
                <div className="w-full max-w-sm">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                    Filter by class
                    <span className="ml-1 text-gray-400 font-normal">(optional — narrows matching scope)</span>
                  </label>
                  <select
                    value={classFilter}
                    onChange={e => setClassFilter(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                  >
                    <option value="">All classes ({students.length} learners)</option>
                    {classList.map(c => (
                      <option key={c} value={c}>
                        {c} ({students.filter(s => s.class_name === c).length} learners)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 cursor-pointer ${
                  dragOver
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 scale-[1.02]'
                    : 'border-gray-300 dark:border-gray-600 hover:border-violet-400 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen className="w-12 h-12 mx-auto mb-3 text-violet-400" />
                <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  {dragOver ? 'Drop photos here!' : 'Select a folder or drag images'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Files named after learners will be auto-matched&nbsp;·&nbsp;JPG, PNG, WebP, HEIC
                </p>
                <div
                  className="flex flex-col sm:flex-row gap-3 justify-center"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-md"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Pick Folder
                  </button>
                  <button
                    onClick={() => filesInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Pick Files
                  </button>
                </div>
              </div>

              {/* Hidden inputs */}
              <input
                ref={folderInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFolderChange}
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore – non-standard but supported in Chrome/Edge/Safari
                webkitdirectory=""
                directory=""
              />
              <input
                ref={filesInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFolderChange}
              />

              <p className="text-xs text-gray-400 max-w-md text-center">
                💡 Name your photo files after the learner —{' '}
                <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">John Doe.jpg</code> or{' '}
                <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">Namatovu Mary.png</code>
              </p>
            </div>
          )}

          {/* ══ STEP: REVIEWING ═══════════════════════════════════════════════ */}
          {step === 'reviewing' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Stats bar */}
              <div className="flex flex-wrap items-center gap-2 px-6 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-slate-750 flex-shrink-0 text-xs">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  {matches.length} file{matches.length !== 1 ? 's' : ''}
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                {highC   > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">{highC} high</span>}
                {mediumC > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{mediumC} medium</span>}
                {lowC    > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{lowC} low</span>}
                {noMatchC > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">{noMatchC} unmatched</span>}
                {skippedC > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">{skippedC} skipped</span>}

                <div className="ml-auto flex items-center gap-3">
                  {noMatchC > 0 && (
                    <button onClick={skipAllUnmatched} className="text-red-600 hover:text-red-700 dark:text-red-400 underline">
                      Skip unmatched
                    </button>
                  )}
                  {lowC > 0 && (
                    <button onClick={skipAllLow} className="text-amber-600 hover:text-amber-700 dark:text-amber-400 underline">
                      Skip low confidence
                    </button>
                  )}
                  <button
                    onClick={() => setStep('select')}
                    className="text-violet-600 hover:text-violet-700 dark:text-violet-400 underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Re-select
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 z-10">
                    <tr className="text-xs text-gray-500 dark:text-gray-400">
                      <th className="text-left px-4 py-2 font-medium w-12">Photo</th>
                      <th className="text-left px-4 py-2 font-medium">File</th>
                      <th className="text-center px-2 py-2 font-medium w-6 text-gray-300">→</th>
                      <th className="text-left px-4 py-2 font-medium">Matched learner</th>
                      <th className="text-center px-3 py-2 font-medium w-24">Match</th>
                      <th className="text-right px-4 py-2 font-medium w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {matches.map(match => (
                      <tr
                        key={match.uid}
                        className={`transition-colors ${
                          match.skip ? 'opacity-40' : ''
                        } ${
                          editingUid === match.uid
                            ? 'bg-violet-50 dark:bg-violet-900/10'
                            : 'hover:bg-gray-50/60 dark:hover:bg-slate-700/30'
                        }`}
                      >
                        {/* Thumbnail */}
                        <td className="px-4 py-2">
                          <img
                            src={match.previewUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover shadow-sm"
                          />
                        </td>

                        {/* File name */}
                        <td className="px-4 py-2 max-w-[180px]">
                          <p className="truncate font-medium text-gray-900 dark:text-gray-100 text-xs" title={match.fileDisplayName}>
                            {match.fileDisplayName}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">{match.file.name}</p>
                        </td>

                        {/* Arrow */}
                        <td className="text-center px-2 py-2">
                          <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600 mx-auto" />
                        </td>

                        {/* Matched learner / inline edit */}
                        <td className="px-4 py-2 min-w-[160px]">
                          {editingUid === match.uid ? (
                            <div className="relative">
                              <div className="relative flex items-center">
                                <Search className="w-3 h-3 text-gray-400 absolute left-2 pointer-events-none" />
                                <input
                                  autoFocus
                                  placeholder="Search learner…"
                                  value={editSearch}
                                  onChange={e => setEditSearch(e.target.value)}
                                  className="w-full pl-6 pr-2 py-1 text-xs border border-violet-400 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none"
                                />
                              </div>
                              <div className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-36 overflow-y-auto">
                                <button
                                  onClick={() => reassign(match.uid, null)}
                                  className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-600 border-b border-gray-100 dark:border-gray-600"
                                >
                                  — Skip this file
                                </button>
                                {editSearchResults.map(s => (
                                  <button
                                    key={s.id}
                                    onClick={() => reassign(match.uid, s)}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center justify-between"
                                  >
                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                      {s.first_name} {s.last_name}
                                    </span>
                                    {s.admission_no && (
                                      <span className="text-gray-400 text-[11px] ml-2 flex-shrink-0">{s.admission_no}</span>
                                    )}
                                  </button>
                                ))}
                                {editSearchResults.length === 0 && (
                                  <p className="px-3 py-2 text-xs text-gray-400">No results</p>
                                )}
                              </div>
                            </div>
                          ) : match.ambiguous ? (
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                              <span className="text-amber-700 dark:text-amber-400 text-xs">
                                {match.ambiguousCandidates.length} possible matches
                              </span>
                            </div>
                          ) : match.matchedStudent ? (
                            <div className="flex items-center gap-2">
                              {match.matchedStudent.photo_url ? (
                                <img
                                  src={match.matchedStudent.photo_url}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover flex-shrink-0 opacity-60 ring-1 ring-gray-200 dark:ring-gray-600"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">
                                    {match.matchedStudent.first_name[0]}{match.matchedStudent.last_name[0]}
                                  </span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-xs">
                                  {match.matchedStudent.first_name} {match.matchedStudent.last_name}
                                </p>
                                {match.matchedStudent.admission_no && (
                                  <p className="text-[11px] text-gray-400">{match.matchedStudent.admission_no}</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-red-500 text-xs italic">Not matched</span>
                          )}
                        </td>

                        {/* Confidence badge */}
                        <td className="text-center px-3 py-2">
                          {match.skip ? (
                            <span className="text-xs text-gray-400">Skipped</span>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${CONFIDENCE_STYLES[match.confidence]}`}>
                              {CONFIDENCE_LABELS[match.confidence]}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2 text-right">
                          {editingUid !== match.uid ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setEditingUid(match.uid); setEditSearch(''); }}
                                title="Reassign to different learner"
                                className="p-1.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/20 text-violet-600 dark:text-violet-400 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleSkip(match.uid)}
                                title={match.skip ? 'Un-skip' : 'Skip this file'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  match.skip
                                    ? 'hover:bg-green-100 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400'
                                    : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400'
                                }`}
                              >
                                {match.skip
                                  ? <Check className="w-3.5 h-3.5" />
                                  : <SkipForward className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingUid(null); setEditSearch(''); }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ STEP: UPLOADING ═══════════════════════════════════════════════ */}
          {step === 'uploading' && (
            <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
              {/* Overall progress */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Uploading {uploadDone} / {uploadTotal}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">{uploadPct}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <motion.div
                    className="h-3 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    animate={{ width: `${uploadPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                  {uploadSuccess > 0 && <span className="text-green-600 dark:text-green-400">✓ {uploadSuccess} uploaded</span>}
                  {uploadFailed  > 0 && <span className="text-red-500 dark:text-red-400">✗ {uploadFailed} failed</span>}
                </div>
              </div>

              {/* Per-file list */}
              <div className="flex-1 overflow-y-auto min-h-0 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
                {matches
                  .filter(m => !m.skip && m.matchedStudent && m.confidence !== 'none')
                  .map(match => (
                    <div key={match.uid} className="flex items-center gap-3 px-4 py-2.5">
                      <img
                        src={match.newPhotoUrl || match.previewUrl}
                        alt=""
                        className={`w-9 h-9 rounded-lg object-cover flex-shrink-0 ${
                          match.uploadStatus === 'uploading' ? 'animate-pulse' : ''
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {match.matchedStudent!.first_name} {match.matchedStudent!.last_name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{match.fileDisplayName}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {match.uploadStatus === 'pending'   && <div className="w-5 h-5 rounded-full border-2 border-gray-200 dark:border-gray-600" />}
                        {match.uploadStatus === 'uploading' && <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />}
                        {match.uploadStatus === 'success'   && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        {match.uploadStatus === 'error'     && (
                          <span title={match.uploadError}>
                            <XCircle className="w-5 h-5 text-red-500" />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ══ STEP: DONE ════════════════════════════════════════════════════ */}
          {step === 'done' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
                uploadFailed === 0
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : 'bg-amber-100 dark:bg-amber-900/30'
              }`}>
                {uploadFailed === 0
                  ? <CheckCircle2 className="w-9 h-9 text-green-500" />
                  : <AlertTriangle className="w-9 h-9 text-amber-500" />}
              </div>

              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  {uploadFailed === 0 ? 'All photos uploaded!' : 'Upload complete'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {uploadSuccess} uploaded successfully
                  {uploadFailed > 0 && `, ${uploadFailed} failed`}
                  {skippedC > 0    && `, ${skippedC} skipped`}
                </p>
              </div>

              {uploadFailed > 0 && (
                <div className="w-full max-w-md border border-red-200 dark:border-red-900/40 rounded-xl overflow-hidden">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400 px-4 py-2 bg-red-50 dark:bg-red-900/20">
                    Failed uploads
                  </p>
                  {matches.filter(m => m.uploadStatus === 'error').map(m => (
                    <div key={m.uid} className="flex items-center gap-2 px-4 py-2 border-t border-red-100 dark:border-red-900/20">
                      <img src={m.previewUrl} alt="" className="w-7 h-7 rounded object-cover opacity-60 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {m.matchedStudent?.first_name} {m.matchedStudent?.last_name}
                        </p>
                        <p className="text-xs text-red-500 truncate">{m.uploadError}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleClose}
                className="px-8 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-md"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* ── Footer (reviewing + uploading only) ──────────────────────────── */}
        {(step === 'reviewing' || step === 'uploading') && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700/50 flex-shrink-0">
            {step === 'reviewing' && (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-white">{ready}</span> photos ready to upload
                  {noMatchC > 0 && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      · {noMatchC} unmatched will be skipped
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runUpload}
                    disabled={ready === 0}
                    className="px-6 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 dark:disabled:from-gray-600 dark:disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload {ready} Photo{ready !== 1 ? 's' : ''}
                  </button>
                </div>
              </>
            )}

            {step === 'uploading' && (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Uploading — please wait…
                </p>
                <button
                  onClick={() => { cancelRef.current = true; }}
                  className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl border border-red-300 dark:border-red-700 transition-colors font-medium"
                >
                  Cancel Upload
                </button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
