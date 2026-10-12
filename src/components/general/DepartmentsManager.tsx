"use client";
import React,{useState} from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const DepartmentsManager: React.FC=()=>{
  const { t } = useI18n();
  const {data,mutate}=useSWR(`${API_BASE}/departments.php`,fetcher); const rows=data?.data||[];
  const [form,setForm]=useState({ name:'', head_staff_id:'', description:'' });
  const add=async()=>{ if(!form.name) return; await fetch(`${API_BASE}/departments.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ name:form.name, head_staff_id: form.head_staff_id? parseInt(form.head_staff_id,10):undefined, description: form.description||undefined })}); setForm({ name:'', head_staff_id:'', description:''}); mutate(); };
  return <div className="space-y-4"> <h2 className="font-semibold text-sm">{t('general.departments')}</h2>
    <div className="grid md:grid-cols-5 gap-2 text-xs"> <input placeholder={t('general.name')} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="px-2 py-1 rounded border" /> <input placeholder={t('general.head_staff_id')} value={form.head_staff_id} onChange={e=>setForm({...form,head_staff_id:e.target.value})} className="px-2 py-1 rounded border" /> <input placeholder={t('general.description')} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="px-2 py-1 rounded border md:col-span-2" /> <button onClick={add} disabled={!form.name} className="px-2 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button> </div>
    <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs"> {rows.map((r:any)=>(<div key={r.id} className="grid md:grid-cols-5 gap-2 px-3 py-2"><span className="col-span-2 truncate">{r.name}</span><span>{r.head_staff_id||'-'}</span><span className="truncate">{r.description||'-'}</span><span className="text-[10px]">{r.id}</span></div>))} {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('general.no_departments')}</div>} </div>
  </div>;
};