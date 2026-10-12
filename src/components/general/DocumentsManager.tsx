"use client";
import React,{useState} from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const DocumentsManager: React.FC=()=>{
  const { t } = useI18n();
  const [filters,setFilters]=useState({ owner_type:'', owner_id:'' });
  const qs=`owner_type=${filters.owner_type||''}&owner_id=${filters.owner_id||''}`;
  const docs=useSWR(`${API_BASE}/documents.php?${qs}`, fetcher);
  const types=useSWR(`${API_BASE}/document_types.php`, fetcher);
  const [form,setForm]=useState({ owner_type:'student', owner_id:'', document_type_id:'', file_name:'', file_url:'', issue_date:'' });
  const add=async()=>{ if(!form.owner_type||!form.owner_id||!form.document_type_id||!form.file_name||!form.file_url) return; await fetch(`${API_BASE}/documents.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ owner_type:form.owner_type, owner_id: parseInt(form.owner_id,10), document_type_id: parseInt(form.document_type_id,10), file_name: form.file_name, file_url: form.file_url, issue_date: form.issue_date||undefined })}); setForm({ owner_type:'student', owner_id:'', document_type_id:'', file_name:'', file_url:'', issue_date:''}); docs.mutate(); };
  return <div className="space-y-4"> <h2 className="font-semibold text-sm">{t('general.documents')}</h2>
    <div className="grid md:grid-cols-6 gap-2 text-xs"> <select value={form.owner_type} onChange={e=>setForm({...form,owner_type:e.target.value})} className="px-2 py-1 rounded border"><option value="student">Student</option><option value="staff">Staff</option></select> <input placeholder={t('general.owner_id')} value={form.owner_id} onChange={e=>setForm({...form,owner_id:e.target.value})} className="px-2 py-1 rounded border" /> <select value={form.document_type_id} onChange={e=>setForm({...form,document_type_id:e.target.value})} className="px-2 py-1 rounded border"><option value="">{t('general.select_type')}</option>{types.data?.data?.map((d:any)=>(<option key={d.id} value={d.id}>{d.label}</option>))}</select> <input placeholder={t('general.file_name')} value={form.file_name} onChange={e=>setForm({...form,file_name:e.target.value})} className="px-2 py-1 rounded border" /> <input placeholder={t('general.file_url')} value={form.file_url} onChange={e=>setForm({...form,file_url:e.target.value})} className="px-2 py-1 rounded border" /> <input type="date" value={form.issue_date} onChange={e=>setForm({...form,issue_date:e.target.value})} className="px-2 py-1 rounded border" /> </div>
    <button onClick={add} disabled={!form.owner_id||!form.document_type_id||!form.file_name||!form.file_url} className="px-3 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40 text-xs">{t('common.add')}</button>
    <div className="flex flex-wrap gap-2 text-xs items-end">
      <input placeholder={t('general.owner_type')} value={filters.owner_type} onChange={e=>setFilters({...filters,owner_type:e.target.value})} className="px-2 py-1 rounded border" />
      <input placeholder={t('general.owner_id')} value={filters.owner_id} onChange={e=>setFilters({...filters,owner_id:e.target.value})} className="px-2 py-1 rounded border" />
    </div>
    <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs max-h-72 overflow-auto"> {docs.data?.data?.map((r:any)=>(<div key={r.id} className="grid md:grid-cols-6 gap-2 px-3 py-2"><span className="font-mono text-[11px]">{r.id}</span><span>{r.owner_type}</span><span>{r.owner_id}</span><span className="truncate">{r.file_name}</span><a href={r.file_url} target="_blank" className="underline text-[10px]" rel="noreferrer">{t('general.open')}</a><span className="text-[10px]">{r.issue_date||'-'}</span></div>))} {(!docs.data||docs.data.data.length===0)&&<div className="px-3 py-6 text-center text-gray-400">{t('general.no_documents')}</div>} </div>
  </div>;
};