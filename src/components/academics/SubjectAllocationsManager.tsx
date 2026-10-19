'use client';

import React, { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Badge
} from '@/components/ui';
import { Loader2, Search, Users, BookOpen, Grid3x3, List, Download, Upload, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  staff_no?: string;
}

interface Class {
  id: number;
  name: string;
  class_level?: string;
}

interface Subject {
  id: number;
  name: string;
  code?: string;
  subject_type?: string;
}

interface Allocation {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  custom_initials: string | null;
  class_name: string;
  subject_name: string;
  teacher_name: string;
  auto_generated_initials: string;
  display_initials: string;
}

interface MatrixCell {
  classId: number;
  subjectId: number;
  allocation: Allocation | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const SubjectAllocationsManager: React.FC = () => {
  const { t, digits } = useI18n();
  // State
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('matrix');
  const [searchTeacher, setSearchTeacher] = useState('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [selectedTeacher, setSelectedTeacher] = useState<number | ''>('');
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Data fetching
  const { data: classesRes, isLoading: loadingClasses } = useSWR<{ data: Class[] }>(`${API_BASE}/classes?limit=100`, fetcher);
  const { data: subjectsRes, isLoading: loadingSubjects } = useSWR<{ data: Subject[] }>(`${API_BASE}/subjects?limit=100`, fetcher);
  const { data: teachersRes, isLoading: loadingTeachers } = useSWR<{ data: Teacher[] }>(`${API_BASE}/staff?limit=200`, fetcher);
  const { data: allocationsRes, mutate: mutateAllocations, isLoading: loadingAllocations } = useSWR<{ data: Allocation[] }>(
    `${API_BASE}/academics/allocations`,
    fetcher
  );

  // Derived data
  // Arrays only — an error body must never reach .map/.filter.
  const arr = <T,>(x: any): T[] => (Array.isArray(x?.data) ? x.data : []);
  const classes = arr<Class>(classesRes);
  const subjects = arr<Subject>(subjectsRes);
  const teachers = arr<Teacher>(teachersRes);
  const allocations = arr<Allocation>(allocationsRes);

  // Filtered allocations for list view
  const filteredAllocations = useMemo(() => {
    return allocations.filter(a => {
      if (filterClass !== 'all' && a.class_id.toString() !== filterClass) return false;
      if (filterSubject !== 'all' && a.subject_id.toString() !== filterSubject) return false;
      if (searchTeacher && !a.teacher_name.toLowerCase().includes(searchTeacher.toLowerCase())) return false;
      return true;
    });
  }, [allocations, filterClass, filterSubject, searchTeacher]);

  // Build matrix: Map<classId, Map<subjectId, Allocation>>
  const matrix = useMemo(() => {
    const map = new Map<number, Map<number, Allocation | null>>();
    classes.forEach(cls => {
      const row = new Map<number, Allocation | null>();
      subjects.forEach(sub => {
        const found = allocations.find(a => a.class_id === cls.id && a.subject_id === sub.id);
        row.set(sub.id, found || null);
      });
      map.set(cls.id, row);
    });
    return map;
  }, [classes, subjects, allocations]);

  // Handlers
  const handleTeacherChange = async (classId: number, subjectId: number, teacherId: number | null) => {
    setSaving(true);
    try {
      const existing = matrix.get(classId)?.get(subjectId);
      const payload = existing?.id
        ? { id: existing.id, class_id: classId, subject_id: subjectId, teacher_id: teacherId, custom_initials: existing.custom_initials }
        : { class_id: classId, subject_id: subjectId, teacher_id: teacherId, custom_initials: null };

      const method = existing?.id ? 'PUT' : 'POST';
      const res = await fetch(`${API_BASE}/academics/allocations`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || 'Failed to update allocation');
      }

      await mutateAllocations();
      toast.success(t('academicsPages.alloc.m.updated', "Allocation updated"));
    } catch (e: any) {
      toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.m.updateFailed', "Failed to update allocation"));
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (!selectedTeacher) {
      toast.error(t('academicsPages.alloc.m.pickBulk', "Select a teacher for bulk assignment"));
      return;
    }

    setSaving(true);
    try {
      const payload = [];
      for (const cls of classes) {
        for (const sub of subjects) {
          // Only include unassigned or class-wide? Let's assign teacher to all cells
          payload.push({
            class_id: cls.id,
            subject_id: sub.id,
            teacher_id: Number(selectedTeacher),
            custom_initials: null,
          });
        }
      }

      const res = await fetch(`${API_BASE}/academics/allocations/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: payload }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Bulk save failed');
      }

      await mutateAllocations();
      toast.success(t('academicsPages.alloc.m.bulkDone', "Bulk allocation completed"));
      setIsBulkMode(false);
    } catch (e: any) {
      toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.m.bulkFailed', "Bulk save failed"));
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Matrix View
  // ─────────────────────────────────────────────────────────────────────────────

  const renderMatrix = () => {
    if (loadingClasses || loadingSubjects || loadingAllocations) {
      return (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ms-2">{t('academicsPages.alloc.m.loading', "Loading matrix...")}</span>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-gray-300 dark:border-slate-600">
              <th className="border p-2 sticky start-0 bg-slate-100 dark:bg-slate-800 z-10 min-w-32 border-e border-gray-300 dark:border-slate-600">{t('academicsPages.alloc.m.corner', "Class \\ Subject")}</th>
              {subjects.map(sub => (
                <th key={sub.id} className="border p-2 min-w-32 bg-slate-100 dark:bg-slate-800 border-r border-gray-300 dark:border-slate-600">
                  <div className="flex flex-col">
                    <span className="font-semibold truncate">{sub.name}</span>
                    {sub.code && <span className="text-xs text-gray-500 dark:text-gray-400">{sub.code}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map(cls => (
              <tr key={cls.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                <td className="border p-2 font-medium sticky start-0 bg-white dark:bg-slate-900 z-10 border-r border-gray-300 dark:border-slate-600">
                  {cls.name}
                </td>
                {subjects.map(sub => {
                  const cell = matrix.get(cls.id)?.get(sub.id);
                  return (
                      <td key={`${cls.id}-${sub.id}`} className="border p-1 align-top bg-white dark:bg-slate-900">
                      {saving ? (
                        <div className="flex items-center justify-center h-12">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      ) : (
                        <Select
                          value={cell?.teacher_id?.toString() || 'unassigned'}
                          onValueChange={val => {
                            handleTeacherChange(
                              cls.id,
                              sub.id,
                              val === 'unassigned' ? null : Number(val)
                            );
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 dark:focus:border-blue-400">
                            <SelectValue placeholder={t('academicsPages.alloc.m.unassigned', "Unassigned")}>
                              {cell ? (
                                <div className="flex items-center gap-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {cell.display_initials || '—'}
                                  </Badge>
                                  <span className="truncate max-w-20">{cell.teacher_name}</span>
                                </div>
                              ) : (
                                t('academicsPages.alloc.m.unassigned', "Unassigned")
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600">
                            <SelectItem value="unassigned" className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100">
                              {t('academicsPages.alloc.m.unassigned', "Unassigned")}
                            </SelectItem>
                            {teachers.map(tch => (
                              <SelectItem
                                key={tch.id}
                                value={tch.id.toString()}
                                className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100"
                              >
                                <div className="flex items-center gap-2">
                                  <span>{tch.first_name} {tch.last_name}</span>
                                  {tch.staff_no && <span className="text-xs text-gray-500 dark:text-gray-400">({tch.staff_no})</span>}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {cell && cell.custom_initials && (
                        <div className="text-[10px] text-amber-600 mt-1" title={t('academicsPages.alloc.m.overrideTitle', "Custom initials override")}>
                          {t('academicsPages.alloc.m.override', "Override")}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: List View
  // ─────────────────────────────────────────────────────────────────────────────

  const renderListView = () => {
    return (
      <div className="rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 dark:bg-slate-800 border-b border-gray-300 dark:border-slate-600">
            <tr>
              <th className="p-3 text-start text-sm font-medium border-e border-gray-300 dark:border-slate-600">{t('academicsPages.alloc.m.class', "Class")}</th>
              <th className="p-3 text-start text-sm font-medium border-e border-gray-300 dark:border-slate-600">{t('academicsPages.alloc.m.subject', "Subject")}</th>
              <th className="p-3 text-start text-sm font-medium border-e border-gray-300 dark:border-slate-600">{t('academicsPages.alloc.m.teacher', "Teacher")}</th>
              <th className="p-3 text-start text-sm font-medium border-e border-gray-300 dark:border-slate-600">{t('academicsPages.alloc.m.initials', "Initials")}</th>
              <th className="p-3 text-start text-sm font-medium">{t('academicsPages.alloc.m.actions', "Actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {filteredAllocations.map(a => (
              <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-white dark:bg-slate-900">
                <td className="p-3 text-sm border-r border-gray-200 dark:border-slate-700">{a.class_name}</td>
                <td className="p-3 text-sm border-r border-gray-200 dark:border-slate-700">{a.subject_name}</td>
                <td className="p-3 text-sm">
                  <Select
                    value={a.teacher_id?.toString() || 'unassigned'}
                    onValueChange={val => handleTeacherChange(a.class_id, a.subject_id, val === 'unassigned' ? null : Number(val))}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-8 text-xs w-48 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 dark:focus:border-blue-400">
                      <SelectValue>{a.teacher_name}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600">
                      <SelectItem value="unassigned" className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100">
                        {t('academicsPages.alloc.m.unassigned', "Unassigned")}
                      </SelectItem>
                      {teachers.map(tch => (
                        <SelectItem
                          key={tch.id}
                          value={tch.id.toString()}
                          className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100"
                        >
                          {tch.first_name} {tch.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-sm border-r border-gray-200 dark:border-slate-700">
                  <Badge variant="outline" className="font-mono">
                    {a.display_initials || '—'}
                  </Badge>
                  {a.custom_initials && (
                    <span className="ms-2 text-xs text-amber-600" title={t('academicsPages.alloc.m.manualTitle', "Manually overridden")}>*</span>
                  )}
                </td>
                <td className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!confirm(t('academicsPages.alloc.m.confirmDelete', "Delete this assignment?"))) return;
                      await fetch(`${API_BASE}/academics/allocations?id=${a.id}`, { method: 'DELETE' });
                      await mutateAllocations();
                      toast.success(t('academicsPages.alloc.m.deleted', "Deleted"));
                    }}
                  >
                    {t('academicsPages.alloc.m.delete', "Delete")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t('academicsPages.alloc.m.title', "Teacher Subject Allocation")}
              </CardTitle>
              <CardDescription>
                {t('academicsPages.alloc.m.desc', "Assign teachers to subjects per class. Changes reflect automatically on all reports.")}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'matrix' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('matrix')}
                  className="rounded-e-none"
                >
                  <Grid3x3 className="w-4 h-4 me-1" />
                  {t('academicsPages.alloc.m.matrix', "Matrix")}
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-s-none"
                >
                  <List className="w-4 h-4 me-1" />
                  {t('academicsPages.alloc.m.list', "List")}
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => mutateAllocations()} title={t('academicsPages.alloc.m.refresh', "Refresh")} aria-label={t('academicsPages.alloc.m.refresh', "Refresh")}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Filters & Actions */}
          <div className="flex flex-wrap items-end gap-4 mb-6 pb-4 border-b">
            <div className="flex-1 min-w-48">
              <Label>{t('academicsPages.alloc.m.filterClass', "Filter by Class")}</Label>
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 dark:focus:border-blue-400">
                  <SelectValue placeholder={t('academicsPages.alloc.m.allClasses', "All Classes")} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600">
                  <SelectItem value="all" className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100">
                    {t('academicsPages.alloc.m.allClasses', "All Classes")}
                  </SelectItem>
                  {classes.map(c => (
                    <SelectItem
                      key={c.id}
                      value={c.id.toString()}
                      className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100"
                    >
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-48">
              <Label>{t('academicsPages.alloc.m.filterSubject', "Filter by Subject")}</Label>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 dark:focus:border-blue-400">
                  <SelectValue placeholder={t('academicsPages.alloc.m.allSubjects', "All Subjects")} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600">
                  <SelectItem value="all" className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100">
                    {t('academicsPages.alloc.m.allSubjects', "All Subjects")}
                  </SelectItem>
                  {subjects.map(s => (
                    <SelectItem
                      key={s.id}
                      value={s.id.toString()}
                      className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100"
                    >
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-48">
              <Label>{t('academicsPages.alloc.m.searchTeacher', "Search Teacher")}</Label>
              <div className="relative">
                <Search className="absolute start-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('academicsPages.alloc.m.searchPh', "Search teacher name...")}
                  value={searchTeacher}
                  onChange={e => setSearchTeacher(e.target.value)}
                  className="ps-8"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant={isBulkMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsBulkMode(!isBulkMode)}
              >
                <Upload className="w-4 h-4 me-1" />
                {t('academicsPages.alloc.m.bulk', "Bulk")}
              </Button>
            </div>
          </div>

          {/* Bulk mode toolbar */}
          {isBulkMode && (
            <div className="mb-4 p-4 border border-amber-200 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                  {t('academicsPages.alloc.m.bulkHelp', "Bulk Mode: Assign teacher to ALL class-subject combinations at once.")}
                  {selectedTeacher && (() => { const st = teachers.find(tch => tch.id === selectedTeacher); return st ? t('academicsPages.alloc.m.selected', { name: `${st.first_name} ${st.last_name}` }) : ''; })()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Select value={selectedTeacher.toString()} onValueChange={val => setSelectedTeacher(Number(val))}>
                    <SelectTrigger className="w-48 h-8 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 dark:focus:border-blue-400">
                      <SelectValue placeholder={t('academicsPages.alloc.m.chooseTeacher', "Choose teacher")} />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600">
                      {teachers.map(tch => (
                        <SelectItem
                          key={tch.id}
                          value={tch.id.toString()}
                          className="hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700 text-gray-900 dark:text-gray-100"
                        >
                          {tch.first_name} {tch.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleBulkSave} disabled={!selectedTeacher || saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {t('academicsPages.alloc.m.apply', "Apply")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsBulkMode(false)}>
                    {t('academicsPages.alloc.m.cancel', "Cancel")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Data Table/Matrix */}
          {viewMode === 'matrix' ? renderMatrix() : renderListView()}

          {/* Stats summary */}
          <div className="mt-4 flex gap-6 text-sm text-gray-600 dark:text-gray-400">
            <span>{t('academicsPages.alloc.m.total', { n: allocations.length })}</span>
            <span>{t('academicsPages.alloc.m.classes', { n: classes.length })}</span>
            <span>{t('academicsPages.alloc.m.subjects', { n: subjects.length })}</span>
            <span>{t('academicsPages.alloc.m.withTeacher', { n: allocations.filter(a => a.teacher_id !== null).length })}</span>
            <span>{t('academicsPages.alloc.m.unassignedCount', { n: allocations.filter(a => a.teacher_id === null).length })}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher
// ─────────────────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => r.json());
