"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const ClassSubjectsManager: React.FC = () => {
  const { t } = useI18n();
  const [classId,setClassId]=useState('');
  const { data: subjects } = useSWR(`${API_BASE}/subjects.php`, fetcher);
  const { data: classes } = useSWR(`${API_BASE}/classes.php`, fetcher);
  const map = useSWR(classId? `${API_BASE}/class_subjects.php?class_id=${classId}`:null, fetcher);
  const [form,setForm]=useState({ subject_id:'' });
  const add=async()=>{ if(!classId||!form.subject_id) return; await fetch(`${API_BASE}/class_subjects.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ class_id: parseInt(classId,10), subject_id: parseInt(form.subject_id,10) })}); setForm({ subject_id:''}); map.mutate(); };
  const del=async(id:number)=>{ await fetch(`${API_BASE}/class_subjects.php`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id })}); map.mutate(); };
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-sm">{t('academics.class_subjects')}</h2>
      <div className="flex flex-wrap gap-2 text-xs items-end">
        <select value={classId} onChange={e=>setClassId(e.target.value)} className="px-2 py-1 rounded border">
          <option value="">{t('academics.select_class')}</option>
          {classes?.data?.map((c:any)=>(<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <select value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})} className="px-2 py-1 rounded border">
          <option value="">{t('academics.select_subject')}</option>
          {subjects?.data?.map((s:any)=>(<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
        <button onClick={add} disabled={!classId||!form.subject_id} className="px-2 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
      </div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs">
        {map.data?.data?.map((r:any)=>(<div key={r.id} className="flex items-center gap-2 px-3 py-2"><span className="flex-1 truncate">{r.subject_name}</span><button onClick={()=>del(r.id)} className="text-[10px] text-red-500 hover:underline">{t('common.delete')}</button></div>))}
        {(!map.data || map.data.data.length===0) && <div className="px-3 py-6 text-center text-gray-400">{t('academics.no_mappings')}</div>}
      </div>
    </div>
  );
};