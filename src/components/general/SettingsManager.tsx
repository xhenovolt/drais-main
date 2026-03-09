"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { t } from '@/lib/i18n';
import { SchoolInfoSettings } from './SchoolInfoSettings';
import { Settings, Building2 } from 'lucide-react';

const API_BASE = '/api';
const fetcher = (u: string) => fetch(u).then(r => r.json());

export const SettingsManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'school'>('school');
  const { data, mutate } = useSWR(`${API_BASE}/settings`, fetcher);
  const rows = data?.data?.settings?.general ? Object.entries(data.data.settings.general).map(([k, v]: [string, any], i: number) => ({ id: i, key_name: k, value_text: String(v) })) : [];
  const [form, setForm] = useState({ key_name: '', value_text: '' });

  const add = async () => {
    if (!form.key_name) return;
    await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: 1, settings: { general: { [form.key_name]: form.value_text } } })
    });
    setForm({ key_name: '', value_text: '' });
    mutate();
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('school')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'school'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          School Information
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'general'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          General Settings
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'school' && <SchoolInfoSettings />}

      {activeTab === 'general' && (
        <div className="space-y-4">
          <h2 className="font-semibold text-sm">{t('general.settings', 'Settings')}</h2>
          <div className="grid md:grid-cols-4 gap-2 text-xs">
            <input
              placeholder={t('general.key', 'Key')}
              value={form.key_name}
              onChange={e => setForm({ ...form, key_name: e.target.value })}
              className="px-2 py-1 rounded border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
            <input
              placeholder={t('general.value', 'Value')}
              value={form.value_text}
              onChange={e => setForm({ ...form, value_text: e.target.value })}
              className="px-2 py-1 rounded border dark:bg-slate-700 dark:border-slate-600 dark:text-white md:col-span-2"
            />
            <button
              onClick={add}
              disabled={!form.key_name}
              className="px-2 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40"
            >
              {t('common.save', 'Save')}
            </button>
          </div>
          <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs">
            {rows.map((r: any) => (
              <div key={r.id} className="grid md:grid-cols-3 gap-2 px-3 py-2">
                <span className="truncate">{r.key_name}</span>
                <span className="col-span-1 truncate">{r.value_text}</span>
                <span className="text-[10px]">{r.id}</span>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="px-3 py-6 text-center text-gray-400">
                {t('general.no_settings', 'No settings')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};