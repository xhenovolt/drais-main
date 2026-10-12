"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const TimetableManager: React.FC = () => {
  const { t } = useI18n();
  const [classId,setClassId]=useState('');
  const rowsSWR=useSWR(classId? `${API_BASE}/timetable.php?class_id=${classId}`:null, fetcher);
  const rows=rowsSWR.data?.data||[];
  const [form,setForm]=useState({ subject_id:'', day_of_week:'1', start_time:'08:00', end_time:'08:40', room:'' });
  const add=async()=>{ if(!classId||!form.subject_id) return; await fetch(`${API_BASE}/timetable.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ class_id: parseInt(classId,10), subject_id: parseInt(form.subject_id,10), day_of_week: parseInt(form.day_of_week,10), start_time: form.start_time+':00', end_time: form.end_time+':00', room: form.room||undefined })}); setForm({ subject_id:'', day_of_week:'1', start_time:'08:00', end_time:'08:40', room:''}); rowsSWR.mutate(); };
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-sm">{t('academics.timetable')}</h2>
      <div className="flex flex-wrap gap-2 text-xs items-end">
        <input placeholder={t('academics.class_id')} value={classId} onChange={e=>setClassId(e.target.value)} className="px-2 py-1 rounded border" />
        <input placeholder={t('academics.subject_id')} value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})} className="px-2 py-1 rounded border" />
        <select value={form.day_of_week} onChange={e=>setForm({...form,day_of_week:e.target.value})} className="px-2 py-1 rounded border">
          <option value="1">Mon</option><option value="2">Tue</option><option value="3">Wed</option><option value="4">Thu</option><option value="5">Fri</option><option value="6">Sat</option><option value="7">Sun</option>
        </select>
        <input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})} className="px-2 py-1 rounded border" />
        <input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('academics.room')} value={form.room} onChange={e=>setForm({...form,room:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} disabled={!classId||!form.subject_id} className="px-2 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
      </div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs max-h-72 overflow-auto">
        {rows.map((r:any)=>(<div key={r.id} className="grid grid-cols-7 gap-2 px-3 py-2"><span>{r.day_of_week}</span><span>{r.start_time?.slice(0,5)}</span><span>{r.end_time?.slice(0,5)}</span><span>{r.subject_id}</span><span>{r.teacher_id||'-'}</span><span>{r.room||'-'}</span><span className="text-[10px]">{r.id}</span></div>))}
        {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('academics.no_timetable')}</div>}
      </div>
    </div>
  );
};