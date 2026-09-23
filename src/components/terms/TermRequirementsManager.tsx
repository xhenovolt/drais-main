"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { t } from '@/lib/i18n';
import { BackendUnavailableNotice } from '@/components/ui/BackendUnavailableNotice';
const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const TermRequirementsManager: React.FC<{ termId:number }> = ({ termId }) => {
  // Depends on a legacy PHP backend that doesn't exist in this deployment
  // (DRAIS is Next.js end-to-end) — check `error` so a failed fetch shows
  // as "unavailable" rather than indistinguishable from "no requirements".
  const { data, error, mutate } = useSWR(`${API_BASE}/term_requirement_items.php?term_id=${termId}`, fetcher);
  const items = data?.data || [];
  const [name,setName]=useState('');
  const [mand,setMand]=useState(true);
  const add=async()=>{ if(!name) return; await fetch(`${API_BASE}/term_requirement_items.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({term_id:termId,name,mandatory:mand})}); setName(''); setMand(true); mutate(); };
  const del=async(id:number)=>{ await fetch(`${API_BASE}/term_requirement_items.php`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); mutate(); };
  if (error) return <BackendUnavailableNotice feature={t('terms.requirements','Term requirements')} />;
  return (
    <div className="rounded-2xl overflow-hidden border border-blue-200 dark:border-indigo-700 backdrop-blur bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 dark:from-slate-900/80 dark:via-indigo-900/60 dark:to-purple-900/60 shadow-2xl mx-20">
      <table className="w-full text-sm">
        <caption className="text-left px-4 py-2 text-xs text-blue-500 font-semibold bg-gradient-to-r from-blue-100 via-white to-pink-100 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-900 rounded-t-xl">{t('terms.requirements','Requirements')}</caption>
        <thead className="text-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
          <tr>
            <th className="px-4 py-2 font-semibold">{t('terms.name','Name')}</th>
            <th className="px-4 py-2 font-semibold">{t('terms.description','Description')}</th>
            <th className="px-4 py-2 font-semibold">{t('terms.mandatory','Mandatory')}</th>
          </tr>
        </thead>
        <tbody>
          {items.length===0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-blue-400">{t('terms.no_requirements','No requirements')}</td></tr>}
          {items.map((it:any)=>(
            <tr key={it.id} className="hover:bg-gradient-to-r hover:from-blue-100 hover:via-pink-100 hover:to-indigo-100 dark:hover:from-indigo-900 dark:hover:via-purple-900 dark:hover:to-pink-900 transition-colors">
              <td className="px-4 py-2 font-semibold text-indigo-700 dark:text-pink-300">{it.name}</td>
              <td className="px-4 py-2 text-xs">{it.description||''}</td>
              <td className="px-4 py-2 text-xs">{it.mandatory ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TermRequirementsManager;
