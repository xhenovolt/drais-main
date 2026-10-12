"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const PaymentsConsole: React.FC = () => {
  const { t } = useI18n();
  const [filters,setFilters]=useState({ student_id:'', term_id:'' });
  const { data } = useSWR(filters.student_id && filters.term_id ? `${API_BASE}/fee_payments.php?student_id=${filters.student_id}&term_id=${filters.term_id}`: null, fetcher);
  const rows=data?.data||[];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('finance.payments')}</h1>
      <div className="grid md:grid-cols-4 gap-2 text-xs p-4 rounded border bg-white/60 dark:bg-slate-900/60">
        <input placeholder={t('finance.student_id')} value={filters.student_id} onChange={e=>setFilters({...filters,student_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.term_id')} value={filters.term_id} onChange={e=>setFilters({...filters,term_id:e.target.value})} className="px-2 py-1 rounded border" />
      </div>
      <div className="rounded border divide-y bg-white/60 dark:bg-slate-900/60 text-xs">
        {rows.map((r:any)=>(
          <div key={r.id} className="grid grid-cols-6 gap-2 px-3 py-2">
            <span className="font-mono text-[11px]">{r.id}</span>
            <span>{r.student_id}</span>
            <span>{r.term_id}</span>
            <span>{r.amount}</span>
            <span>{r.method||'-'}</span>
            <span className="truncate">{r.reference||'-'}</span>
          </div>
        ))}
        {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('finance.no_payments')}</div>}
      </div>
    </div>
  );
};