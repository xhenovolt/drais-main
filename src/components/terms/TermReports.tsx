"use client";
import React, { useState } from 'react';
import useSWRImmutable from 'swr/immutable';
import { t } from '@/lib/i18n';
import { BackendUnavailableNotice } from '@/components/ui/BackendUnavailableNotice';
const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';
// This used to .catch(()=>({})) — silently turning a failed fetch (this
// depends on a legacy PHP backend that doesn't exist in this deployment)
// into a truthy empty object, which then rendered "No students reported"
// as if the term genuinely had none. Letting the rejection through lets
// useSWR's `error` distinguish "actually empty" from "backend unreachable".
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const TermReports: React.FC<{ termId:number }> = ({ termId }) => {
  const { data, error, mutate } = useSWRImmutable(`${API_BASE}/term_reports.php?term_id=${termId}`, fetcher);
  const reports = Array.isArray(data?.data) ? data.data : [];
  const reqItems = Array.isArray(data?.requirements) ? data.requirements : [];
  const reqStatus = Array.isArray(data?.requirement_status) ? data.requirement_status : [];
  const statusMap: Record<string,Record<number,number>> = {};
  reqStatus.forEach((r:any)=>{ if(!statusMap[r.student_id]) statusMap[r.student_id]={}; statusMap[r.student_id][r.item_id]=r.brought; });
  const rows = Array.isArray(data?.data) ? data.data : [];
  const [studentId,setStudentId]=useState('');
  const [date,setDate]=useState('');
  const [selectedReq,setSelectedReq]=useState<Record<number,boolean>>({});
  const studentsApi = useSWRImmutable(`${API_BASE}/students.php?page=1&size=1000`, fetcher);
  const allStudents = Array.isArray(studentsApi.data?.data) ? studentsApi.data.data : [];
  const totalReq = reqItems ? reqItems.length : 0;
  const add=async()=>{ if(!studentId) return; await fetch(`${API_BASE}/term_reports.php`,{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ term_id:termId, student_id: parseInt(studentId,10), report_date: date||undefined })});
    if(Object.keys(selectedReq).length){
      const items = Object.entries(selectedReq).map(([id,val])=>({ item_id: parseInt(id,10), brought: val }));
      await fetch(`${API_BASE}/term_reports.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ requirements_update: true, term_id: termId, student_id: parseInt(studentId,10), items }) });
    }
    setStudentId(''); setDate(''); setSelectedReq({}); mutate(); };
  
  if (error) return <BackendUnavailableNotice feature={t('terms.reports','Term reports')} />;

  // Show loading state while data is being fetched
  if (!data) {
    return (
      <div className="rounded-2xl overflow-hidden border border-blue-200 dark:border-indigo-700 p-8 bg-white/80">
        <p className="text-center text-gray-500">{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }
  
  return (
    <div className="rounded-2xl overflow-hidden border border-blue-200 dark:border-indigo-700 backdrop-blur bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 dark:from-slate-900/80 dark:via-indigo-900/60 dark:to-purple-900/60 shadow-2xl mx-20">
      <table className="w-full text-sm">
        <caption className="text-left px-4 py-2 text-xs text-blue-500 font-semibold bg-gradient-to-r from-blue-100 via-white to-pink-100 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-900 rounded-t-xl">{t('terms.reported_students','Reported Students')}</caption>
        <thead className="text-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
          <tr>
            <th className="px-4 py-2 font-semibold">{t('terms.student','Student')}</th>
            <th className="px-4 py-2 font-semibold">{t('terms.admission_no','Admission #')}</th>
            <th className="px-4 py-2 font-semibold">{t('terms.report_date','Report Date')}</th>
            {reqItems && reqItems.length > 0 && reqItems.map((ri:any)=>(<th key={ri.id} className="px-4 py-2 font-semibold hidden lg:table-cell">{ri.name}</th>))}
            {totalReq>0 && <th className="px-4 py-2 font-semibold">{t('terms.requirements_progress','Reqs')}</th>}
            <th className="px-4 py-2 font-semibold">{t('terms.status','Status')}</th>
          </tr>
        </thead>
        <tbody>
          {reports && reports.length > 0 && reports.map((r:any)=>(
            <tr key={r.id} className="hover:bg-gradient-to-r hover:from-blue-100 hover:via-pink-100 hover:to-indigo-100 dark:hover:from-indigo-900 dark:hover:via-purple-900 dark:hover:to-pink-900 transition-colors odd:bg-black/5 dark:odd:bg-white/5">
              <td className="px-4 py-2 text-xs">{r.first_name} {r.last_name}</td>
              <td className="px-4 py-2 text-xs font-mono">{r.admission_no}</td>
              <td className="px-4 py-2 text-xs">{r.report_date}</td>
              {reqItems && reqItems.length > 0 && reqItems.map((ri:any)=>(
                <td key={ri.id} className="px-4 py-2 hidden lg:table-cell">
                  <input type="checkbox" checked={!!statusMap[r.student_id]?.[ri.id]} onChange={async e=>{
                    const items = reqItems.map((it:any)=>({ item_id: it.id, brought: !!statusMap[r.student_id]?.[it.id] }));
                    const idx = items.findIndex((i:any)=>i.item_id===ri.id); if(idx>-1) items[idx].brought = e.target.checked; else items.push({ item_id: ri.id, brought: e.target.checked });
                    await fetch(`${API_BASE}/term_reports.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ requirements_update: true, term_id: termId, student_id: r.student_id, items }) });
                    mutate();
                  }} />
                </td>
              ))}
              {totalReq>0 && (
                <td className="px-4 py-2 text-xs">
                  {(()=>{ const brought = reqItems.filter((ri:any)=> statusMap[r.student_id]?.[ri.id]).length; const missing = reqItems.filter((ri:any)=> !statusMap[r.student_id]?.[ri.id]).map((m:any)=>m.name); return (
                    <span title={missing.length? t('terms.missing','Missing')+': '+missing.join(', '): t('terms.all_brought','All brought')} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-black/5 dark:bg-white/10">
                      {brought}/{totalReq}
                    </span>
                  ); })()}
                </td>
              )}
              <td className="px-4 py-2 text-xs">{t(`status.${r.status}`, r.status)}</td>
            </tr>
          ))}
          {(!reports || reports.length === 0) && <tr><td colSpan={4 + (reqItems ? reqItems.length : 0) + (totalReq>0?1:0)} className="px-4 py-8 text-center text-gray-400">{t('terms.none_reported','No students reported')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export default TermReports;
