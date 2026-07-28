'use client';

/**
 * Configurable subject ordering (Reporting Architecture Phase 1).
 *
 * Replaces raw database-id ordering on report cards with a school-controlled
 * priority. Drag to set the order for one scope: the school-wide default, a
 * specific class, or a specific exam/result type — most specific wins when a
 * report renders (see src/lib/reports/subjectOrder.ts). Unconfigured subjects
 * always sort after configured ones, alphabetically — never randomly.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, GripVertical, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SubjectRow { id: number; name: string; subjectType: string | null; }
interface ScopeOption { id: number; name: string; }

function SortableSubjectRow({ subject, index, configured }: { subject: SubjectRow; index: number; configured: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subject.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 ${isDragging ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white dark:bg-gray-800'}`}>
      <span {...attributes} {...listeners} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing flex-shrink-0">
        <GripVertical className="w-4 h-4" />
      </span>
      <span className="w-7 text-xs font-mono text-gray-400 flex-shrink-0">{index + 1}</span>
      <span className="flex-1 font-medium text-gray-800 dark:text-gray-100 truncate">{subject.name}</span>
      {subject.subjectType && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 flex-shrink-0">{subject.subjectType}</span>}
      {!configured && <span className="text-[10px] text-gray-400 italic flex-shrink-0">unconfigured</span>}
    </div>
  );
}

export default function SubjectOrderPage() {
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [configuredIds, setConfiguredIds] = useState<Set<number>>(new Set());
  const [classes, setClasses] = useState<ScopeOption[]>([]);
  const [resultTypes, setResultTypes] = useState<ScopeOption[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [resultTypeId, setResultTypeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const scopeQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (classId) params.set('class_id', classId);
    if (resultTypeId) params.set('result_type_id', resultTypeId);
    return params.toString();
  }, [classId, resultTypeId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/subjects/order?${scopeQuery}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.success) {
        setSubjects(j.subjects);
        const configured = new Set<number>(
          (j.rules || [])
            .filter((rule: any) => (rule.classId ?? null) === (classId ? Number(classId) : null) && (rule.resultTypeId ?? null) === (resultTypeId ? Number(resultTypeId) : null))
            .map((rule: any) => rule.subjectId),
        );
        setConfiguredIds(configured);
      }
    } finally { setLoading(false); }
  }, [scopeQuery, classId, resultTypeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const [clsRes, rtRes] = await Promise.all([
        fetch('/api/classes', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/result_types', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      if (clsRes?.success) setClasses((clsRes.data || []).map((c: any) => ({ id: c.id, name: c.name })));
      if (rtRes?.success) setResultTypes((rtRes.data || []).map((r: any) => ({ id: r.id, name: r.name })));
    })();
  }, []);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !subjects) return;
    const oldIndex = subjects.findIndex((s) => s.id === active.id);
    const newIndex = subjects.findIndex((s) => s.id === over.id);
    setSubjects(arrayMove(subjects, oldIndex, newIndex));
    setConfiguredIds((prev) => new Set([...prev, Number(active.id)]));
  };

  const save = useCallback(async () => {
    if (!subjects) return;
    setSaving(true);
    try {
      const r = await fetch('/api/subjects/order', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subjectIds: subjects.map((s) => s.id),
          classId: classId ? Number(classId) : null,
          resultTypeId: resultTypeId ? Number(resultTypeId) : null,
        }),
      });
      const j = await r.json();
      if (j.success) { toast.success('Order saved'); load(); }
      else toast.error(j.error || 'Failed to save');
    } finally { setSaving(false); }
  }, [subjects, classId, resultTypeId, load]);

  const scopeLabel = classId || resultTypeId
    ? [classId && `class: ${classes.find((c) => String(c.id) === classId)?.name || classId}`, resultTypeId && `exam: ${resultTypes.find((r) => String(r.id) === resultTypeId)?.name || resultTypeId}`].filter(Boolean).join(', ')
    : 'school-wide default';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><ArrowUpDown className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Subject Order on Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Drag to set the order subjects appear on report cards — no more random database order.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500">Scope — set a default for everyone, or override for one class / one exam type</p>
        <div className="flex flex-wrap gap-2">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
            <option value="">All classes (school default)</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={resultTypeId} onChange={(e) => setResultTypeId(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
            <option value="">All exam types</option>
            {resultTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-400">Editing order for: <span className="font-medium text-indigo-600 dark:text-indigo-400">{scopeLabel}</span>. A class/exam-specific order overrides the school default only for that scope.</p>
      </div>

      {loading && <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-600 inline" /></div>}

      {!loading && subjects && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={subjects.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {subjects.map((s, i) => (
                  <SortableSubjectRow key={s.id} subject={s} index={i} configured={configuredIds.has(s.id)} />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => { setClassId(''); setResultTypeId(''); }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <RotateCcw className="w-3.5 h-3.5" /> Back to school default
            </button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save order
            </button>
          </div>
        </>
      )}
    </div>
  );
}
