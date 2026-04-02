"use client";

import React, { useState } from 'react';
import {
  Users, Briefcase, Plus, Edit2, Trash2, Save, X, RefreshCw, Search,
  ChevronLeft, ChevronRight, Fingerprint, Loader,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function UserMappingPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [userType, setUserType] = useState<'' | 'student' | 'staff'>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    device_user_id: '', user_type: 'student' as 'student' | 'staff',
    student_id: '', staff_id: '', device_sn: '', card_number: '',
  });
  const [saving, setSaving] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '50');
  if (userType) params.set('user_type', userType);
  if (search) params.set('search', search);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/zk/user-mapping?${params.toString()}`,
    fetcher,
  );

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);

  const mappings = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const devices = devicesData?.data || [];

  const resetForm = () => {
    setForm({ device_user_id: '', user_type: 'student', student_id: '', staff_id: '', device_sn: '', card_number: '' });
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.device_user_id) {
      showToast('error', 'Device User ID is required');
      return;
    }
    if (form.user_type === 'student' && !form.student_id) {
      showToast('error', 'Student ID is required for student mappings');
      return;
    }
    if (form.user_type === 'staff' && !form.staff_id) {
      showToast('error', 'Staff ID is required for staff mappings');
      return;
    }

    setSaving(true);
    try {
      const isEdit = editingId !== null;
      const payload = {
        device_user_id: form.device_user_id,
        user_type: form.user_type,
        student_id: form.user_type === 'student' ? form.student_id : undefined,
        staff_id: form.user_type === 'staff' ? form.staff_id : undefined,
        device_sn: form.device_sn || undefined,
        card_number: form.card_number || undefined,
      };

      await apiFetch(
        isEdit ? `/api/attendance/zk/user-mapping?id=${editingId}` : '/api/attendance/zk/user-mapping',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          successMessage: isEdit ? 'Mapping updated' : 'Mapping created',
        },
      );
      resetForm();
      mutate();
    } catch {
      // apiFetch already showed error toast
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!await confirmAction('Delete this mapping?', 'This action cannot be undone.', 'Delete')) return;
    try {
      await apiFetch(`/api/attendance/zk/user-mapping?id=${id}`, {
        method: 'DELETE',
        successMessage: 'Mapping deleted',
      });
      mutate();
    } catch {
      // apiFetch already showed error toast
    }
  };

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setForm({
      device_user_id: m.device_user_id,
      user_type: m.user_type,
      student_id: m.student_id?.toString() || '',
      staff_id: m.staff_id?.toString() || '',
      device_sn: m.device_sn || '',
      card_number: m.card_number || '',
    });
    setShowAddForm(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Fingerprint className="w-7 h-7 text-blue-500" />
            User Mapping
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Map device user IDs to students and staff &bull; {pagination.total} mappings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { resetForm(); setShowAddForm(!showAddForm); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="w-4 h-4" /> Add Mapping
          </button>
          <button onClick={() => mutate()} className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2">
        {(['', 'student', 'staff'] as const).map(t => (
          <button key={t} onClick={() => { setUserType(t); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              userType === t
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}>
            {t === '' && <><Users className="w-4 h-4 inline mr-1" /> All</>}
            {t === 'student' && <><Users className="w-4 h-4 inline mr-1" /> Students</>}
            {t === 'staff' && <><Briefcase className="w-4 h-4 inline mr-1" /> Staff</>}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search by Device User ID…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white" />
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-6">
          <h3 className="text-sm font-semibold mb-4">
            {editingId ? 'Edit Mapping' : 'New Mapping'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Device User ID *</label>
              <input type="text" value={form.device_user_id}
                onChange={e => setForm(f => ({ ...f, device_user_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type *</label>
              <select value={form.user_type}
                onChange={e => setForm(f => ({ ...f, user_type: e.target.value as 'student' | 'staff' }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700">
                <option value="student">Student</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            {form.user_type === 'student' ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Student ID *</label>
                <input type="text" value={form.student_id}
                  onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700" />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Staff ID *</label>
                <input type="text" value={form.staff_id}
                  onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700" />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Device SN</label>
              <select value={form.device_sn}
                onChange={e => setForm(f => ({ ...f, device_sn: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700">
                <option value="">All Devices</option>
                {devices.map((d: any) => <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Card #</label>
              <input type="text" value={form.card_number}
                onChange={e => setForm(f => ({ ...f, card_number: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              <button onClick={resetForm}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : mappings.length === 0 ? (
          <div className="text-center py-12">
            <Fingerprint className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 mt-3">No mappings found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device User ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student / Staff ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Card</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {mappings.map((m: any) => (
                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 text-sm">
                  <td className="px-4 py-3 font-mono font-medium">{m.device_user_id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.user_type === 'student'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    }`}>
                      {m.user_type === 'student' ? <Users className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                      {m.user_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">{m.student_id || m.staff_id || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{m.device_sn || 'All'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.card_number || '—'}</td>
                  <td className="px-4 py-3 flex items-center gap-1">
                    <button onClick={() => startEdit(m)}
                      className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(m.id)}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
