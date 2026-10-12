"use client";
import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { TermProgress } from './TermProgress';
import { TermReports } from './TermReports';
import { TermRequirementsManager } from './TermRequirementsManager';
import { useI18n } from '@/components/i18n/I18nProvider';
import { BackendUnavailableNotice } from '@/components/ui/BackendUnavailableNotice';

const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());

export default function TermDetail({ id }: { id:string }){
  const { t } = useI18n();
  // This page's own term_item.php fetch, and the three sub-managers below,
  // all depend on a legacy PHP backend that doesn't exist in this
  // deployment (DRAIS is Next.js end-to-end). Checking `error` here
  // matters: without it, a failed fetch left `data` undefined forever and
  // this page never left "Loading term..." — an infinite spinner rather
  // than a clear explanation.
  const { data, error } = useSWR(`${API_BASE}/term_item.php?id=${id}`, fetcher);
  if (error) {
    return (
      <div className="p-6">
        <BackendUnavailableNotice feature={t('terms.progress')} />
      </div>
    );
  }
  if(!data) return <div className="text-sm text-gray-500">{t('terms.loading')}</div>;
  return (
    <div className="rounded-2xl border border-blue-200 dark:border-indigo-700 bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 dark:from-slate-900/80 dark:via-indigo-900/60 dark:to-purple-900/60 shadow-2xl p-8 mx-20">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-indigo-700 dark:text-pink-300">{data.name}</h1>
          <p className="text-xs text-gray-500">{t('terms.dates')}: {data.start_date||'-'} → {data.end_date||'-'}</p>
        </div>
        <Link href="/terms/list" className="text-xs text-[var(--color-primary)] font-medium">{t('common.back_to_list')}</Link>
      </div>
      <div className="grid md:grid-cols-3 gap-6 text-sm">
        <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur border-white/30 dark:border-white/10 md:col-span-1">
          <b>{t('terms.progress')}</b>
          <TermProgress termId={parseInt(id,10)} />
        </div>
        <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur border-white/30 dark:border-white/10 md:col-span-1">
          <b>{t('terms.reports')}</b>
          <TermReports termId={parseInt(id,10)} />
        </div>
        <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur border-white/30 dark:border-white/10 md:col-span-1">
          <b>{t('terms.requirements')}</b>
          <TermRequirementsManager termId={parseInt(id,10)} />
        </div>
      </div>
    </div>
  );
}
