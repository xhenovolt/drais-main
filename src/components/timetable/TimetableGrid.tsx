'use client';
import React, { useState, useEffect, Fragment, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, Transition } from '@headlessui/react';
import {
  Calendar, Clock, Plus, Edit, Trash2, BookOpen, Users, X, Wand2,
  RefreshCw, AlertTriangle, CheckCircle, Loader2, ChevronDown, Info, Zap
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import Swal from 'sweetalert2';

const API = '/api';
const fetcher = (u: string) => fetch(u).then(r => r.json());

const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
];

interface Period { id: number; name: string; short_name: string; start_time: string; end_time: string; period_order: number; is_break: boolean; }
interface ClassOption { id: number; name: string; class_level?: number; }
interface StreamOption { id: number; name: string; class_id: number; }
interface SubjectOption { id: number; name: string; code?: string; subject_type?: string; }
interface TeacherOption { id: number; name: string; position?: string; }
interface TimetableEntry {
  id: number; day_of_week: number; period_id: number; class_id: number; stream_id?: number;
  subject_id: number; teacher_id?: number; room?: string;
  period_name?: string; period_short?: string; start_time?: string; end_time?: string; period_order?: number;
  class_name?: string; stream_name?: string; subject_name?: string; subject_code?: string; teacher_name?: string;
}

// ─── Color palette for subjects ──────────────────────────────────
const SUBJECT_COLORS = [
  'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100',
  'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100',
  'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-100',
  'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100',
  'bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100',
  'bg-cyan-100 dark:bg-cyan-900/40 border-cyan-300 dark:border-cyan-700 text-cyan-900 dark:text-cyan-100',
  'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-100',
  'bg-teal-100 dark:bg-teal-900/40 border-teal-300 dark:border-teal-700 text-teal-900 dark:text-teal-100',
  'bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-100',
  'bg-pink-100 dark:bg-pink-900/40 border-pink-300 dark:border-pink-700 text-pink-900 dark:text-pink-100',
];

function getSubjectColor(subjectId: number) {
  return SUBJECT_COLORS[subjectId % SUBJECT_COLORS.length];
}

// ─── Main Component ──────────────────────────────────────────────
export default function TimetableGrid() {
  // Selected class/stream filter
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStreamId, setSelectedStreamId] = useState<string>('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    day: number; periodId: number; entry?: TimetableEntry;
  } | null>(null);
  const [formData, setFormData] = useState({ subject_id: '', teacher_id: '', stream_id: '', room: '' });
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [checkingConflict, setCheckingConflict] = useState(false);

  // Auto-generate state
  const [generating, setGenerating] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<any[] | null>(null);
  const [previewSummary, setPreviewSummary] = useState<any>(null);

  // ─── Data fetching ──────────────────────────────────────────────
  const { data: meta, error: metaError } = useSWR(`${API}/timetable-metadata`, fetcher);
  const metadata = meta?.data;
  const classes: ClassOption[] = metadata?.classes || [];
  const allStreams: StreamOption[] = metadata?.streams || [];
  const subjects: SubjectOption[] = metadata?.subjects || [];
  const teachers: TeacherOption[] = metadata?.teachers || [];
  const periods: Period[] = (metadata?.periods || []).filter((p: Period) => !p.is_break);
  const allPeriods: Period[] = metadata?.periods || [];

  // Filter streams by selected class
  const streams = allStreams.filter(s => !selectedClassId || s.class_id === Number(selectedClassId));

  // Fetch timetable entries
  const entryParams = new URLSearchParams();
  if (selectedClassId) entryParams.set('class_id', selectedClassId);
  if (selectedStreamId) entryParams.set('stream_id', selectedStreamId);
  const { data: entriesData, mutate: mutateEntries } = useSWR(
    selectedClassId ? `${API}/timetable-entries?${entryParams}` : null,
    fetcher
  );
  const entries: TimetableEntry[] = entriesData?.data || [];

  // Build lookup: "day-periodId" -> entry
  const entryMap = new Map<string, TimetableEntry>();
  entries.forEach(e => {
    entryMap.set(`${e.day_of_week}-${e.period_id}`, e);
  });

  // ─── Cell click handler ─────────────────────────────────────────
  const handleCellClick = (day: number, periodId: number) => {
    const existing = entryMap.get(`${day}-${periodId}`);
    setModalData({ day, periodId, entry: existing || undefined });
    setFormData({
      subject_id: existing?.subject_id?.toString() || '',
      teacher_id: existing?.teacher_id?.toString() || '',
      stream_id: existing?.stream_id?.toString() || selectedStreamId || '',
      room: existing?.room || ''
    });
    setConflicts([]);
    setModalOpen(true);
  };

  // ─── Conflict check on field change ─────────────────────────────
  const checkConflict = useCallback(async (data: typeof formData) => {
    if (!modalData) return;
    setCheckingConflict(true);
    try {
      const res = await fetch(`${API}/timetable-entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_of_week: modalData.day,
          period_id: modalData.periodId,
          teacher_id: data.teacher_id ? Number(data.teacher_id) : null,
          stream_id: data.stream_id ? Number(data.stream_id) : null,
          room: data.room || null,
          exclude_id: modalData.entry?.id
        })
      });
      const result = await res.json();
      setConflicts(result.conflicts || []);
    } catch {
      // Ignore
    } finally {
      setCheckingConflict(false);
    }
  }, [modalData]);

  // Debounced conflict check
  useEffect(() => {
    if (!modalOpen || !modalData) return;
    const timer = setTimeout(() => checkConflict(formData), 400);
    return () => clearTimeout(timer);
  }, [formData.teacher_id, formData.stream_id, formData.room, modalOpen]);

  // ─── Save entry ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!modalData || !formData.subject_id || !selectedClassId) return;
    if (conflicts.length > 0) {
      toast.error('Cannot save: scheduling conflicts exist.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        day_of_week: modalData.day,
        period_id: modalData.periodId,
        class_id: Number(selectedClassId),
        stream_id: formData.stream_id ? Number(formData.stream_id) : null,
        subject_id: Number(formData.subject_id),
        teacher_id: formData.teacher_id ? Number(formData.teacher_id) : null,
        room: formData.room || null,
      };

      let res;
      if (modalData.entry?.id) {
        res = await fetch(`${API}/timetable-entries`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, id: modalData.entry.id })
        });
      } else {
        res = await fetch(`${API}/timetable-entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const result = await res.json();
      if (result.success) {
        toast.success(modalData.entry ? 'Lesson updated!' : 'Lesson scheduled!');
        setModalOpen(false);
        mutateEntries();
      } else if (result.conflicts) {
        setConflicts(result.conflicts);
        toast.error(result.conflicts[0]);
      } else {
        toast.error(result.error || 'Failed to save');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete entry ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (!modalData?.entry?.id) return;
    const result = await Swal.fire({
      title: 'Remove this lesson?',
      text: 'This will clear this timetable slot.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Remove',
    });
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API}/timetable-entries?id=${modalData.entry.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Lesson removed');
        setModalOpen(false);
        mutateEntries();
      } else {
        toast.error(data.error);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ─── Auto-generate ─────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedClassId) { toast.error('Select a class first.'); return; }
    setGenerating(true);
    try {
      const res = await fetch(`${API}/timetable-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: Number(selectedClassId), stream_id: selectedStreamId ? Number(selectedStreamId) : null })
      });
      const result = await res.json();
      if (result.success) {
        setPreviewEntries(result.data);
        setPreviewSummary(result.summary);
      } else {
        toast.error(result.error || 'Generation failed');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAcceptGenerated = async () => {
    if (!previewEntries) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API}/timetable-generate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: previewEntries,
          class_id: Number(selectedClassId),
          stream_id: selectedStreamId ? Number(selectedStreamId) : null,
          clear_existing: true
        })
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Timetable saved! ${result.inserted} entries created.`);
        setPreviewEntries(null);
        setPreviewSummary(null);
        mutateEntries();
      } else {
        toast.error(result.error);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Render helper for grid cell ────────────────────────────────
  const renderCell = (day: number, period: Period, isPreview = false) => {
    const key = `${day}-${period.id}`;
    const previewEntry = isPreview ? previewEntries?.find(e => e.day_of_week === day && e.period_id === period.id) : null;
    const entry = isPreview ? previewEntry : entryMap.get(key);

    if (!entry) {
      return (
        <td
          key={key}
          onClick={() => !isPreview && handleCellClick(day, period.id)}
          className="border border-gray-200 dark:border-gray-700 p-1 h-20 min-w-[120px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group relative"
        >
          <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Plus className="w-5 h-5 text-gray-400" />
          </div>
        </td>
      );
    }

    const colorClass = getSubjectColor(entry.subject_id);
    return (
      <td
        key={key}
        onClick={() => !isPreview && handleCellClick(day, period.id)}
        className={`border border-gray-200 dark:border-gray-700 p-1 h-20 min-w-[120px] ${!isPreview ? 'cursor-pointer' : ''} transition-colors`}
      >
        <div className={`h-full rounded-lg border p-1.5 ${colorClass} ${isPreview ? 'opacity-80 ring-2 ring-yellow-400' : ''}`}>
          <div className="font-semibold text-[11px] leading-tight truncate">
            {entry.subject_name || subjects.find(s => s.id === entry.subject_id)?.name || `Sub ${entry.subject_id}`}
          </div>
          {(entry.teacher_name || entry.teacher_id) && (
            <div className="text-[10px] opacity-70 truncate mt-0.5">
              <Users className="w-3 h-3 inline mr-0.5" />
              {entry.teacher_name || teachers.find(t => t.id === entry.teacher_id)?.name || ''}
            </div>
          )}
          {entry.room && (
            <div className="text-[10px] opacity-60 truncate">
              {entry.room}
            </div>
          )}
        </div>
      </td>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Timetable
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Click any cell to schedule a lesson
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Class selector */}
          <select
            value={selectedClassId}
            onChange={e => { setSelectedClassId(e.target.value); setSelectedStreamId(''); setPreviewEntries(null); }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Class</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Stream selector */}
          {streams.length > 0 && (
            <select
              value={selectedStreamId}
              onChange={e => { setSelectedStreamId(e.target.value); setPreviewEntries(null); }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Streams</option>
              {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* Auto-generate button */}
          <button
            onClick={handleGenerate}
            disabled={!selectedClassId || generating}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-medium shadow hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Auto Generate
          </button>

          {/* Refresh */}
          <button
            onClick={() => mutateEntries()}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview banner */}
      <AnimatePresence>
        {previewEntries && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center gap-4"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-yellow-800 dark:text-yellow-200">
                <Zap className="w-5 h-5" />
                Timetable Preview
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {previewSummary?.total_placed} lessons placed across {periods.length} periods &times; 5 days.
                {previewSummary?.unplaced && (
                  <span className="text-red-600 dark:text-red-400 ml-2">
                    {previewSummary.unplaced.map((u: any) => `${u.subject_name} (${u.remaining} unplaced)`).join(', ')}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAcceptGenerated}
                disabled={generating}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Accept &amp; Save
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-lg bg-yellow-600 text-white text-sm font-medium hover:bg-yellow-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
              <button
                onClick={() => { setPreviewEntries(null); setPreviewSummary(null); }}
                className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No class selected */}
      {!selectedClassId ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h2 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Select a class to view the timetable</h2>
          <p className="text-sm text-gray-400 mt-2">Choose a class from the dropdown above to start scheduling</p>
        </div>
      ) : (
        /* Grid Table */
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
                  <th className="text-left px-3 py-3 text-white font-semibold w-24 sticky left-0 bg-gradient-to-r from-blue-600 to-blue-600 z-10">
                    Day / Period
                  </th>
                  {(previewEntries ? periods : allPeriods).map(p => (
                    <th key={p.id} className="text-center px-2 py-3 text-white font-semibold min-w-[120px]">
                      {p.is_break ? (
                        <div className="text-yellow-200">
                          <div className="text-xs">{p.name}</div>
                          <div className="text-[10px] opacity-70">{p.start_time?.slice(0,5)} - {p.end_time?.slice(0,5)}</div>
                        </div>
                      ) : (
                        <>
                          <div>{p.short_name || p.name}</div>
                          <div className="text-[10px] opacity-70 font-normal">{p.start_time?.slice(0,5)} - {p.end_time?.slice(0,5)}</div>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => (
                  <tr key={day.value} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                    <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">
                      <div className="text-sm">{day.label}</div>
                    </td>
                    {(previewEntries ? periods : allPeriods).map(p => {
                      if (p.is_break) {
                        return (
                          <td key={`${day.value}-${p.id}`} className="border border-gray-200 dark:border-gray-700 h-20 bg-gray-50 dark:bg-gray-900/30">
                            <div className="flex items-center justify-center h-full text-xs text-gray-400">
                              {p.name}
                            </div>
                          </td>
                        );
                      }
                      return renderCell(day.value, p, !!previewEntries);
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Period management info */}
      {selectedClassId && periods.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">No periods defined</span>
          </div>
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
            You need to set up timetable periods first. Run the migration SQL or add periods via the API.
          </p>
        </div>
      )}

      {/* ─── Edit/Add Modal ──────────────────────────────────────── */}
      <Transition appear show={modalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[9999]" onClose={() => setModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-full p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <Dialog.Title className="text-lg font-bold text-white">
                        {modalData?.entry ? 'Edit Lesson' : 'Schedule Lesson'}
                      </Dialog.Title>
                      <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-white/20 text-white"><X className="w-5 h-5" /></button>
                    </div>
                    {modalData && (
                      <div className="text-sm text-white/80 mt-1">
                        {DAYS.find(d => d.value === modalData.day)?.label} &bull; {allPeriods.find(p => p.id === modalData.periodId)?.name}
                        <span className="ml-2 text-white/60">
                          ({allPeriods.find(p => p.id === modalData.periodId)?.start_time?.slice(0,5)} - {allPeriods.find(p => p.id === modalData.periodId)?.end_time?.slice(0,5)})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Conflict warnings */}
                  <AnimatePresence>
                    {conflicts.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-6 py-3"
                      >
                        {conflicts.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {c}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Form */}
                  <div className="p-6 space-y-4">
                    {/* Subject */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        <BookOpen className="w-4 h-4 inline mr-1" /> Subject *
                      </label>
                      <select
                        value={formData.subject_id}
                        onChange={e => setFormData(f => ({ ...f, subject_id: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Subject</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                      </select>
                    </div>

                    {/* Teacher */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        <Users className="w-4 h-4 inline mr-1" /> Teacher
                      </label>
                      <select
                        value={formData.teacher_id}
                        onChange={e => setFormData(f => ({ ...f, teacher_id: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Teacher (optional)</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {checkingConflict && (
                        <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                        </div>
                      )}
                    </div>

                    {/* Stream */}
                    {streams.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Stream
                        </label>
                        <select
                          value={formData.stream_id}
                          onChange={e => setFormData(f => ({ ...f, stream_id: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All / No Stream</option>
                          {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Room */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Room (optional)
                      </label>
                      <input
                        type="text"
                        value={formData.room}
                        onChange={e => setFormData(f => ({ ...f, room: e.target.value }))}
                        placeholder="e.g. Lab 1, Room 205"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    {modalData?.entry ? (
                      <button
                        onClick={handleDelete}
                        className="px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm font-medium transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    ) : <div />}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModalOpen(false)}
                        className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || !formData.subject_id || conflicts.length > 0}
                        className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-semibold shadow hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {modalData?.entry ? 'Update' : 'Schedule'}
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
