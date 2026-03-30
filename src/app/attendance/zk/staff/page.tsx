"use client";

import React, { useState } from 'react';
import {
  Briefcase, Plus, Edit2, Trash2, Save, X, RefreshCw, Search,
  ChevronLeft, ChevronRight, Fingerprint, Loader,
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';

export default function ZKStaffMappingPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ device_user_id: '', staff_id: '', device_sn: '', card_number: '' });
  const [saving, setSaving] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '50');
  params.set('user_type', 'staff');
  if (search) params.set('search', search);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/zk/user-mapping?${params.toString()}`,
    fetcher,
  );
  const { data: devicesData } = useSWR<any>('/api/attendance/zk/devices', fetcher);

  const mappings = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const devices = devicesData?.data || [];

  const resetForm = () => {
    setForm({ device_user_id: '', staff_id: '', device_sn: '', card_number: '' });
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.device_user_id || !form.staff_id) {
      toast.error('Device User ID and Staff ID are required');
      return;
    }
    setSaving(true);
    try {
      const isEdit = editingId !== null;
      const payload = {
        ...(isEdit ? { id: editingId } : {}),
        device_user_id: form.device_user_id,
        user_type: 'staff',
        staff_id: parseInt(form.staff_id, 10),
        device_sn: form.device_sn || null,
        card_number: form.card_number || null,
      };

      const res = await fetch('/api/attendance/zk/user-mapping', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(isEdit ? 'Mapping updated' : 'Mapping created');
      resetForm();
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      const res = await fetch(`/api/attendance/zk/user-mapping?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Mapping deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setForm({
      device_user_id: m.device_user_id || '',
      staff_id: String(m.staff_id || ''),
      device_sn: m.device_sn || '',
      card_number: m.card_number || '',
    });
    setShowAddForm(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Briefcase className="w-7 h-7 text-indigo-500" />
            Staff Device Mapping
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Link ZKTeco device user IDs to DRAIS staff
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { resetForm(); setShowAddForm(!showAddForm); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
            <Plus className="w-4 h-4" /> Add Mapping
          </button>
          <button onClick={() => mutate()} className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-6">
          <h3 className="text-sm font-semibold mb-4">
            {editingId ? 'Edit Mapping' : 'New Staff Mapping'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Device User ID *</label>
              <input type="text" value={form.device_user_id}
                onChange={(e) => setForm(p => ({ ...p, device_user_id: e.target.value }))}
                placeholder="e.g. 501"
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700 font-mono" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Staff ID *</label>
              <input type="number" value={form.staff_id}
                onChange={(e) => setForm(p => ({ ...p, staff_id: e.target.value }))}
                placeholder="DRAIS Staff ID"
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Device (optional)</label>
              <select value={form.device_sn} onChange={(e) => setForm(p => ({ ...p, device_sn: e.target.value }))}
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700">
                <option value="">All Devices (global)</option>
                {devices.map((d: any) => (
                  <option key={d.serial_number} value={d.serial_number}>{d.device_name || d.serial_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Card Number</label>
              <input type="text" value={form.card_number}
                onChange={(e) => setForm(p => ({ ...p, card_number: e.target.value }))}
                placeholder="Optional"
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Update' : 'Create'}
              </button>
              <button onClick={resetForm} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search device user ID..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800" />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="text-left py-3 px-4">Device User ID</th>
                <th className="text-left py-3 px-4">Staff ID</th>
                <th className="text-left py-3 px-4">Device</th>
                <th className="text-left py-3 px-4">Card #</th>
                <th className="text-left py-3 px-4">Created</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    <Fingerprint className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No staff mappings yet
                  </td>
                </tr>
              ) : (
                mappings.map((m: any) => (
                  <tr key={m.id} className="border-t dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                    <td className="py-2.5 px-4 font-mono font-medium">{m.device_user_id}</td>
                    <td className="py-2.5 px-4">Staff #{m.staff_id}</td>
                    <td className="py-2.5 px-4 text-gray-500">{m.device_sn || 'All (global)'}</td>
                    <td className="py-2.5 px-4 text-gray-500">{m.card_number || '—'}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-500">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2.5 px-4 flex gap-1">
                      <button onClick={() => startEdit(m)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-blue-600">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(m.id)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-700">
            <p className="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700 border-gray-300 dark:border-gray-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700 border-gray-300 dark:border-gray-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
