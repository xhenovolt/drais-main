"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { t } from '@/lib/i18n';
import { BackendUnavailableNotice } from '@/components/ui/BackendUnavailableNotice';
const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const TermProgress: React.FC<{ termId:number }> = ({ termId }) => {
  // Depends on a legacy PHP backend that doesn't exist in this deployment
  // (DRAIS is Next.js end-to-end). Without checking `error`, a failed
  // fetch left `rows` at its `[]` default and this rendered "No progress
  // logged" — indistinguishable from a genuinely empty term, which
  // silently hides the real problem.
  const { data, error, mutate } = useSWR(`${API_BASE}/term_progress.php?term_id=${termId}`, fetcher);
  const rows = data||[];
  const [date,setDate]=useState<string>('');
  const [summary,setSummary]=useState('');
  const [notes,setNotes]=useState('');
  const submit=async()=>{ if(!date) return; await fetch(`${API_BASE}/term_progress.php`,{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify({ term_id:termId, day_date:date, summary, notes })}); setSummary(''); setNotes(''); mutate(); };
  if (error) return <BackendUnavailableNotice feature={t('terms.progress','Term progress')} />;
  return (
    <div className="rounded-2xl overflow-hidden border border-blue-200 dark:border-indigo-700 backdrop-blur bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 dark:from-slate-900/80 dark:via-indigo-900/60 dark:to-purple-900/60 shadow-2xl mx-20">
      <table className="w-full text-sm">
        <caption className="text-left px-4 py-2 text-xs text-blue-500 font-semibold bg-gradient-to-r from-blue-100 via-white to-pink-100 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-900 rounded-t-xl">{t('terms.progress','Progress')}</caption>
        <thead className="text-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
          <tr>
            <th className="px-4 py-2 font-semibold">{t('terms.date','Date')}</th>
            <th className="px-4 py-2 font-semibold">{t('terms.summary','Summary')}</th>
            <th className="px-4 py-2 font-semibold">{t('terms.notes','Notes')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r:any)=>(
            <tr key={r.id||r.day_date} className="hover:bg-gradient-to-r hover:from-blue-100 hover:via-pink-100 hover:to-indigo-100 dark:hover:from-indigo-900 dark:hover:via-purple-900 dark:hover:to-pink-900 transition-colors">
              <td className="px-4 py-2 text-xs">{r.day_date}</td>
              <td className="px-4 py-2 text-xs">{r.summary||'-'}</td>
              <td className="px-4 py-2 text-xs">{r.notes||''}</td>
            </tr>
          ))}
          {rows.length===0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-blue-400">{t('terms.no_progress','No progress logged')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export default TermProgress;
