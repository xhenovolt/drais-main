'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Loader,
  Users,
  Merge,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Shield,
  RefreshCw,
  BookOpen,
  Calendar,
  FileText,
  Trash2,
} from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import Swal from 'sweetalert2';
import { useI18n } from '@/components/i18n/I18nProvider';

// ─── Types ──────────────────────────────────────────────────────────
interface DupStudent {
  id: number;
  first_name: string;
  last_name: string;
  admission_no: string | null;
  class_name: string | null;
  class_id: number | null;
  status: string;
  created_at: string;
  admission_date: string | null;
  enrollment_count: number;
  attendance_count: number;
  results_count: number;
}

interface DuplicateGroup {
  group_id: number;
  match_reason: string;
  confidence: 'high' | 'medium' | 'low';
  students: DupStudent[];
}

interface DetectionResult {
  success: boolean;
  total_students: number;
  groups: DuplicateGroup[];
  total_groups: number;
  total_duplicates: number;
}

// The server names the reason in English; these are the phrases it sends.
const REASON_KEYS: Record<string, string> = {
  'Exact name match': 'exactName',
  'Same name + same admission number': 'nameAndAdmNo',
  'Same name + same class': 'nameAndClass',
  'Same admission number': 'admNo',
};

// ─── Page ───────────────────────────────────────────────────────────
export default function DuplicatesPage() {
  const { t, formatDate, digits } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DetectionResult | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [selectedPrimary, setSelectedPrimary] = useState<Map<number, number>>(new Map()); // groupId -> primaryStudentId
  const [merging, setMerging] = useState<Set<number>>(new Set()); // group_ids being merged
  const [bulkMerging, setBulkMerging] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [purging, setPurging] = useState(false);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<DetectionResult>('/api/students/duplicates', { silent: true });
      setData(res);
      // Auto-expand first 5 groups
      const initial = new Set(res.groups.slice(0, 5).map((g: DuplicateGroup) => g.group_id));
      setExpandedGroups(initial);
      // Auto-select primary as the student with most data in each group
      const primaries = new Map<number, number>();
      for (const g of res.groups) {
        const best = [...g.students].sort((a, b) => {
          const scoreA = a.enrollment_count + a.attendance_count + a.results_count;
          const scoreB = b.enrollment_count + b.attendance_count + b.results_count;
          return scoreB - scoreA;
        })[0];
        primaries.set(g.group_id, best.id);
      }
      setSelectedPrimary(primaries);
    } catch (err: any) {
      showToast('error', err.message || t('students.duplicates.detectFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchDuplicates(); }, [fetchDuplicates]);

  const toggleGroup = (groupId: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const selectPrimary = (groupId: number, studentId: number) => {
    setSelectedPrimary(prev => new Map(prev).set(groupId, studentId));
  };

  // ── Single group merge ────────────────────────────────────────────
  const mergeGroup = async (group: DuplicateGroup) => {
    const primaryId = selectedPrimary.get(group.group_id);
    if (!primaryId) {
      showToast('error', t('students.duplicates.selectPrimary'));
      return;
    }

    const secondaryIds = group.students.filter(s => s.id !== primaryId).map(s => s.id);
    const primary = group.students.find(s => s.id === primaryId)!;

    const confirmed = await confirmAction(
      t('students.duplicates.merge.title'),
      t('students.duplicates.merge.body', { name: `${primary.first_name} ${primary.last_name}`, id: primaryId, count: secondaryIds.length }),
      t('students.duplicates.merge.confirm')
    );
    if (!confirmed) return;

    setMerging(prev => new Set(prev).add(group.group_id));
    try {
      await apiFetch('/api/students/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_id: primaryId, secondary_ids: secondaryIds }),
        successMessage: t('students.duplicates.merge.done', { count: secondaryIds.length, id: primaryId }),
      });
      // Refresh
      fetchDuplicates();
    } catch (err: any) {
      // Error toast handled by apiFetch
    } finally {
      setMerging(prev => {
        const next = new Set(prev);
        next.delete(group.group_id);
        return next;
      });
    }
  };

  // ── Bulk merge all ────────────────────────────────────────────────
  const mergeAll = async () => {
    if (!data || data.groups.length === 0) return;

    const totalGroups = data.groups.length;
    const totalDups = data.total_duplicates - totalGroups; // Subtract primaries

    const result = await Swal.fire({
      title: t('students.duplicates.mergeAll.title'),
      html: `
        <div class="text-start space-y-2">
          <p>${t('students.duplicates.mergeAll.intro', { duplicates: `<strong>${digits(totalDups)}</strong>`, groups: `<strong>${digits(totalGroups)}</strong>` })}</p>
          <p>${t('students.duplicates.mergeAll.explain')}</p>
          <p class="text-red-600 font-semibold">${t('students.duplicates.cannotUndo')}</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: t('students.duplicates.mergeAll.confirm'),
      cancelButtonText: t('students.duplicates.cancel'),
    });

    if (!result.isConfirmed) return;

    const groups = data.groups.map(g => {
      const primaryId = selectedPrimary.get(g.group_id) || g.students[0].id;
      return {
        primary_id: primaryId,
        secondary_ids: g.students.filter(s => s.id !== primaryId).map(s => s.id),
      };
    });

    // Chunk the merge so a large double-import (100s of groups) never exceeds a
    // single serverless function's time budget. Each chunk is its own request;
    // chunks commit independently, so a mid-run failure keeps prior progress and
    // the admin can simply re-run to finish (merged dups drop out of the rescan).
    const CHUNK = 10;
    setBulkMerging(true);
    setBulkProgress({ done: 0, total: groups.length });
    let merged = 0, failed = 0;
    try {
      for (let i = 0; i < groups.length; i += CHUNK) {
        const chunk = groups.slice(i, i + CHUNK);
        try {
          const res = await apiFetch<any>('/api/students/duplicates/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groups: chunk }),
            silent: true,
          });
          merged += res.total_merged || 0;
          failed += res.total_failed || 0;
        } catch {
          failed += chunk.length; // whole chunk failed — keep going with the rest
        }
        setBulkProgress({ done: Math.min(i + CHUNK, groups.length), total: groups.length });
      }
      showToast(failed > 0 ? 'warning' : 'success',
        failed > 0 ? t('students.duplicates.mergeAll.partial', { merged, failed }) : t('students.duplicates.mergeAll.done', { merged, removed: totalDups }));
      fetchDuplicates();
    } finally {
      setBulkMerging(false);
      setBulkProgress(null);
    }
  };

  // ── Purge all (result-aware hard-delete + merge) ──────────────────
  const purgeAll = async () => {
    if (!data || data.groups.length === 0) return;
    setPurging(true);

    try {
      // Dry-run first to show breakdown
      const preview = await apiFetch<any>('/api/students/duplicates/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
        silent: true,
      });

      if (preview.ghosts_to_delete === 0 && preview.data_records_to_merge === 0) {
        await Swal.fire({
          title: t('students.duplicates.purge.nothingTitle'),
          text: t('students.duplicates.purge.nothingBody'),
          icon: 'info',
        });
        return;
      }

      const result = await Swal.fire({
        title: t('students.duplicates.purge.title'),
        html: `
          <div class="text-start space-y-3">
            <p>${t('students.duplicates.purge.groupsFound', { count: preview.groups_found })}</p>
            <div class="flex gap-4 mt-2">
              <div class="flex-1 p-3 bg-red-50 rounded-lg border border-red-200">
                <p class="text-2xl font-bold text-red-700">${digits(preview.ghosts_to_delete)}</p>
                <p class="text-sm text-red-600 font-medium">${t('students.duplicates.purge.ghosts')}</p>
                <p class="text-xs text-red-500 mt-1">${t('students.duplicates.purge.ghostsNote', { deleted: `<strong>${t('students.duplicates.purge.permanentlyDeleted')}</strong>` })}</p>
              </div>
              <div class="flex-1 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p class="text-2xl font-bold text-amber-700">${digits(preview.data_records_to_merge)}</p>
                <p class="text-sm text-amber-600 font-medium">${t('students.duplicates.purge.dataRecords')}</p>
                <p class="text-xs text-amber-500 mt-1">${t('students.duplicates.purge.dataNote', { merged: `<strong>${t('students.duplicates.purge.merged')}</strong>` })}</p>
              </div>
            </div>
            <p class="text-xs text-slate-500 mt-2">${t('students.duplicates.purge.warning')}</p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: t('students.duplicates.purge.confirm'),
        cancelButtonText: t('students.duplicates.cancel'),
      });

      if (!result.isConfirmed) return;

      const res = await apiFetch<any>('/api/students/duplicates/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
        successMessage: t('students.duplicates.purge.done', { deleted: preview.ghosts_to_delete, merged: preview.data_records_to_merge }),
      });

      if (res.failed > 0) {
        showToast('warning', t('students.duplicates.purge.partial', { deleted: res.deleted, merged: res.merged, failed: res.failed }));
      }

      fetchDuplicates();
    } catch {
      // handled by apiFetch
    } finally {
      setPurging(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  const confidenceColor = (c: string) => {
    switch (c) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'medium': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/students/list" className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500 rtl-flip" />
          </Link>
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('students.duplicates.title')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('students.duplicates.subtitle')}</p>
          </div>
        </div>

        {/* Stats Bar */}
        {data && !loading && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label={t('students.duplicates.stat.totalStudents')} value={data.total_students} icon={<Users className="w-5 h-5 text-blue-500" />} />
            <Stat label={t('students.duplicates.stat.groups')} value={data.total_groups} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
            <Stat label={t('students.duplicates.stat.totalDuplicates')} value={data.total_duplicates} icon={<Users className="w-5 h-5 text-red-500" />} />
            <Stat label={t('students.duplicates.stat.toMerge')} value={data.total_duplicates - data.total_groups} icon={<Merge className="w-5 h-5 text-emerald-500" />} />
          </div>
        )}

        {/* Action Bar */}
        {data && data.groups.length > 0 && (
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={fetchDuplicates}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {t('students.duplicates.refresh')}
            </button>
            <button
              onClick={mergeAll}
              disabled={bulkMerging || loading || purging}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-500 hover:to-orange-500 transition-all disabled:opacity-50"
            >
              {bulkMerging ? <Loader className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
              {bulkMerging && bulkProgress
                ? t('students.duplicates.mergeAll.progress', { done: bulkProgress.done, total: bulkProgress.total })
                : t('students.duplicates.mergeAll.button', { count: data.total_duplicates - data.total_groups })}
            </button>
            <button
              onClick={purgeAll}
              disabled={purging || bulkMerging || loading}
              title={t('students.duplicates.purge.tooltip')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-rose-700 to-red-700 text-white hover:from-rose-600 hover:to-red-600 transition-all disabled:opacity-50"
            >
              {purging ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('students.duplicates.purge.button')}
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-12 flex flex-col items-center justify-center gap-4">
            <Loader className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-slate-500 dark:text-slate-400">{t('students.duplicates.scanning')}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && data && data.groups.length === 0 && (
          <div className="mt-12 flex flex-col items-center justify-center gap-4 p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="p-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('students.duplicates.noneTitle')}</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md text-center">
              {t('students.duplicates.noneBody', { count: data.total_students })}
            </p>
          </div>
        )}

        {/* Duplicate Groups */}
        {!loading && data && data.groups.length > 0 && (
          <div className="mt-6 space-y-4">
            {data.groups.map(group => {
              const isExpanded = expandedGroups.has(group.group_id);
              const isMerging = merging.has(group.group_id);
              const primaryId = selectedPrimary.get(group.group_id);

              return (
                <div
                  key={group.group_id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm"
                >
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group.group_id)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-start"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 rtl-flip" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {group.students[0].first_name} {group.students[0].last_name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor(group.confidence)}`}>
                          {t(`students.duplicates.confidence.${group.confidence}`)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {t('students.duplicates.recordCount', { count: group.students.length })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {REASON_KEYS[group.match_reason] ? t(`students.duplicates.reason.${REASON_KEYS[group.match_reason]}`) : group.match_reason}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        mergeGroup(group);
                      }}
                      disabled={isMerging || bulkMerging}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {isMerging ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
                      {t('students.duplicates.merge.button')}
                    </button>
                  </button>

                  {/* Students Table */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-800">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50">
                              <th className="px-4 py-2 text-start text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('students.duplicates.col.keep')}</th>
                              <th className="px-4 py-2 text-start text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('students.duplicates.col.id')}</th>
                              <th className="px-4 py-2 text-start text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('students.duplicates.col.name')}</th>
                              <th className="px-4 py-2 text-start text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('students.duplicates.col.admNo')}</th>
                              <th className="px-4 py-2 text-start text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('students.duplicates.col.class')}</th>
                              <th className="px-4 py-2 text-start text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('students.duplicates.col.status')}</th>
                              <th className="px-4 py-2 text-start text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('students.duplicates.col.created')}</th>
                              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                <span title={t('students.duplicates.col.enrollments')}><BookOpen className="w-3.5 h-3.5 inline" /></span>
                              </th>
                              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                <span title={t('students.duplicates.col.attendance')}><Calendar className="w-3.5 h-3.5 inline" /></span>
                              </th>
                              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                <span title={t('students.duplicates.col.results')}><FileText className="w-3.5 h-3.5 inline" /></span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {group.students.map(student => {
                              const isPrimary = primaryId === student.id;
                              return (
                                <tr
                                  key={student.id}
                                  className={`cursor-pointer transition-colors ${
                                    isPrimary
                                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-s-4 border-emerald-500'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/30 border-s-4 border-transparent'
                                  }`}
                                  onClick={() => selectPrimary(group.group_id, student.id)}
                                >
                                  <td className="px-4 py-3">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                      isPrimary
                                        ? 'bg-emerald-500 text-white'
                                        : 'border-2 border-slate-300 dark:border-slate-600'
                                    }`}>
                                      {isPrimary && <Shield className="w-3 h-3" />}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 font-mono text-xs text-slate-500">#{digits(student.id)}</td>
                                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                                    {student.first_name} {student.last_name}
                                    {isPrimary && (
                                      <span className="ms-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">{t('students.duplicates.primary')}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                                    {student.admission_no || '—'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    {student.class_name || '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <StatusBadge status={student.status} />
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500">
                                    {student.created_at ? formatDate(student.created_at) : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <DataCount count={student.enrollment_count} />
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <DataCount count={student.attendance_count} />
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <DataCount count={student.results_count} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────
function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const { formatNumber } = useI18n();
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatNumber(value)}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    admitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    suspended: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  };
  const { t } = useI18n();
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || colors.inactive}`}>
      {t(`students.duplicates.status.${status}`, String(status ?? ''))}
    </span>
  );
}

function DataCount({ count }: { count: number }) {
  const { digits } = useI18n();
  if (count === 0) return <span className="text-xs text-slate-400">{digits(0)}</span>;
  return (
    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
      {digits(count)}
    </span>
  );
}
