"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import { showToast } from '@/lib/toast';
import { FileText, Plus, Copy, Star, Pencil, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Template {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  school_id: number | null;
}

export default function TemplatesPage() {
  const { data, isLoading, mutate } = useSWR<{ success: boolean; templates: Template[] }>('/api/report-templates', swrFetcher);
  const templates = data?.templates || [];
  const [activating, setActivating] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleSetActive = async (id: number) => {
    setActivating(id);
    try {
      const res = await fetch('/api/report-templates/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: id }),
      });
      if (!res.ok) throw new Error('Failed to set active');
      showToast('success', 'Template activated');
      mutate();
    } catch {
      showToast('error', 'Failed to activate template');
    } finally {
      setActivating(null);
    }
  };

  const handleDuplicate = async (id: number) => {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/report-templates/${id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to duplicate');
      showToast('success', 'Template duplicated');
      mutate();
    } catch {
      showToast('error', 'Failed to duplicate template');
    } finally {
      setDuplicating(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/report-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('success', 'Template deleted');
      mutate();
    } catch {
      showToast('error', 'Failed to delete template');
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="ml-2 text-gray-500">Loading templates...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Report Templates</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Design and manage report card layouts</p>
        </div>
        <Link
          href="/settings/templates/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> New Template
        </Link>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No templates found</p>
          <Link href="/settings/templates/new" className="text-indigo-600 hover:underline text-sm mt-1 inline-block">Create your first template</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow group">
              {/* Preview area */}
              <div className="h-36 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center border-b border-gray-200 dark:border-gray-700 relative">
                <div className="w-20 h-28 bg-white dark:bg-gray-700 rounded shadow-sm border border-gray-200 dark:border-gray-600 flex flex-col items-center justify-center gap-1 p-2">
                  <div className="w-full h-1.5 rounded bg-gray-300 dark:bg-gray-500" />
                  <div className="w-3/4 h-1 rounded bg-gray-200 dark:bg-gray-600" />
                  <div className="w-full mt-1 flex-1 space-y-0.5">
                    {[1,2,3,4].map(i => <div key={i} className="w-full h-0.5 rounded bg-gray-200 dark:bg-gray-600" />)}
                  </div>
                </div>
                {t.is_default && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-semibold flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" /> Default
                  </span>
                )}
                {!t.school_id && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] font-semibold">Global</span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{t.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.description || 'No description'}</p>

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <Link
                    href={`/settings/templates/${t.id}/edit`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </Link>
                  <button
                    onClick={() => handleDuplicate(t.id)}
                    disabled={duplicating === t.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    {duplicating === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />} Duplicate
                  </button>
                  <button
                    onClick={() => handleSetActive(t.id)}
                    disabled={activating === t.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                  >
                    {activating === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />} Activate
                  </button>
                  {t.school_id && (
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 ml-auto"
                    >
                      {deleting === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
