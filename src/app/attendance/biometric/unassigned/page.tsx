'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Fingerprint, Clock, CheckCircle, AlertTriangle, RefreshCw,
  UserCheck, Search, Loader,
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

/* ── Types ─────────────────────────────────────────────────────── */

interface UnassignedEntry {
  /** 'orphan' = unclaimed fingerprint template; 'pending' = device user awaiting triage */
  kind: 'orphan' | 'pending';
  id: number;
  device_sn: string;
  device_slot: number | string;
  device_name: string | null;
  status: string;
  source: string;
  finger_index: number | null;
  initiated_at: string;
  captured_at: string | null;
  updated_at: string;
  initiated_by_name: string | null;
  candidates: Array<{ type: string; id: number; name: string; score: number }> | null;
}

/** Rows from the two sources can share numeric ids — key by kind+id. */
const rowKey = (e: UnassignedEntry) => `${e.kind}:${e.id}`;

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  admission_no: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  INITIATED:  'bg-yellow-100 text-yellow-800',
  CAPTURED:   'bg-blue-100 text-blue-800',
  UNASSIGNED: 'bg-orange-100 text-orange-800',
  ASSIGNED:   'bg-green-100 text-green-800',
  VERIFIED:   'bg-emerald-100 text-emerald-800',
  ORPHANED:   'bg-red-100 text-red-800',
  AMBIGUOUS:  'bg-purple-100 text-purple-800',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

/* ── Component ─────────────────────────────────────────────────── */

export default function BiometricUnassignedPage() {
  const [assigning, setAssigning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Record<string, number>>({});

  const { data, isLoading, mutate } = useSWR<{ enrollments: UnassignedEntry[]; total: number }>(
    '/api/biometric/unassigned?limit=100',
    { refreshInterval: 15000 },
  );

  const { data: studData } = useSWR<{ students: Student[] }>(
    `/api/students/search?q=${encodeURIComponent(searchQuery)}&limit=20`,
    { dedupingInterval: 300 },
  );

  const students: Student[] = studData?.students ?? [];
  const enrollments: UnassignedEntry[] = data?.enrollments ?? [];

  async function handleAssign(entry: UnassignedEntry) {
    const key = rowKey(entry);
    const studentId = selectedStudent[key];
    if (!studentId) {
      showToast('warning', 'Select a student first');
      return;
    }
    setAssigning(key);
    try {
      // Phase 2M — orphan templates go through the claim flow (binds
      // identity + promotes the template); pending device users go
      // through the triage resolution (canonical enrollment + legacy
      // mirror + punch re-matching).
      if (entry.kind === 'orphan') {
        await apiFetch('/api/biometric/orphans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orphan_id: entry.id, student_id: studentId }),
          successMessage: 'Template claimed and identity mapped',
        });
      } else {
        await apiFetch('/api/biometric/pending-device-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: entry.id, action: 'map', user_type: 'student', student_id: studentId }),
          successMessage: 'Device user mapped',
        });
      }
      mutate();
    } catch (e: any) {
      showToast('error', e?.message ?? 'Assignment failed');
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Fingerprint className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Unassigned Biometric Enrollments</h1>
            <p className="text-sm text-gray-500">
              Fingerprint slots captured without a confirmed identity
            </p>
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Unassigned', icon: AlertTriangle, color: 'text-orange-500', count: enrollments.length },
          { label: 'Total tracked', icon: Fingerprint, color: 'text-indigo-500', count: data?.total ?? 0 },
          { label: 'Resolved today', icon: CheckCircle, color: 'text-green-500', count: '—' },
        ].map(({ label, icon: Icon, color, count }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <Icon className={`w-6 h-6 ${color}`} />
            <div>
              <div className="text-xl font-bold text-gray-800">{count}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Student search (shared for all rows) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search student name to select for assignment…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 text-sm border-none outline-none placeholder:text-gray-400"
          />
        </div>
        {searchQuery && students.length > 0 && (
          <ul className="divide-y divide-gray-100 max-h-40 overflow-y-auto rounded-lg border border-gray-100">
            {students.map(s => (
              <li
                key={s.id}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 flex items-center justify-between"
                onClick={() => {
                  // Apply this student to the first unconfigured enrollment row
                  const firstUnconfigured = enrollments.find(e => !selectedStudent[rowKey(e)]);
                  if (firstUnconfigured) {
                    setSelectedStudent(prev => ({ ...prev, [rowKey(firstUnconfigured)]: s.id }));
                    setSearchQuery('');
                    showToast('info', `Selected "${s.first_name} ${s.last_name}" for slot ${firstUnconfigured.device_slot}`);
                  }
                }}
              >
                <span className="font-medium text-gray-800">{s.first_name} {s.last_name}</span>
                {s.admission_no && <span className="text-gray-400 text-xs">{s.admission_no}</span>}
              </li>
            ))}
          </ul>
        )}
        {searchQuery && students.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">No students found</p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            <Loader className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <CheckCircle className="w-8 h-8 text-green-400" />
            <p className="text-sm font-medium">No unassigned enrollments</p>
            <p className="text-xs text-gray-400">All fingerprint slots have an identity assigned</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Device / Slot</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Finger</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Initiated</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assign to</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {enrollments.map(enr => {
                const picked = selectedStudent[rowKey(enr)];
                const pickedStudent = students.find(s => s.id === picked);
                return (
                  <tr key={rowKey(enr)} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-700">{enr.device_sn}</div>
                      <div className="text-gray-400 text-xs">PIN {enr.device_slot}{enr.device_name ? ` · ${enr.device_name}` : ''}</div>
                      {enr.candidates && enr.candidates.length > 0 && (
                        <div className="text-[10px] text-purple-500 mt-0.5">
                          suggests: {enr.candidates.slice(0, 2).map(c => c.name).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={enr.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {enr.finger_index !== null ? `F${enr.finger_index}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-gray-500 text-xs">
                        <Clock className="w-3 h-3" />
                        {fmt(enr.initiated_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {enr.initiated_by_name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {picked ? (
                        <div className="flex items-center gap-1">
                          <span className="text-green-700 text-xs font-medium">
                            {pickedStudent ? `${pickedStudent.first_name} ${pickedStudent.last_name}` : `ID ${picked}`}
                          </span>
                          <button
                            onClick={() => setSelectedStudent(prev => { const n = { ...prev }; delete n[rowKey(enr)]; return n; })}
                            className="text-gray-300 hover:text-red-400 text-xs ml-1"
                          >✕</button>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">— search above —</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={!picked || assigning === rowKey(enr)}
                        onClick={() => handleAssign(enr)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {assigning === rowKey(enr)
                          ? <Loader className="w-3 h-3 animate-spin" />
                          : <UserCheck className="w-3 h-3" />
                        }
                        Assign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
