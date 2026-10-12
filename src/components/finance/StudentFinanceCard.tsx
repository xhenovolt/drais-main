"use client";
import React from 'react';
import { FeeItemsManager } from './FeeItemsManager';
import { FeePaymentsManager } from './FeePaymentsManager';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const StudentFinanceCard: React.FC<{ studentId:number; termId:number }> = ({ studentId, termId }) => {
  const { t } = useI18n();
  const { data } = useSWR(`${API_BASE}/finance_summary.php?student_id=${studentId}&term_id=${termId}`, fetcher);
  const totals = data?.totals||{};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs">
        <Stat label={t('finance.total')} value={totals.amount} />
        <Stat label={t('finance.discount')} value={totals.discount} />
        <Stat label={t('finance.paid')} value={totals.paid} />
        <Stat label={t('finance.balance')} value={totals.balance} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <FeeItemsManager studentId={studentId} termId={termId} />
        <FeePaymentsManager studentId={studentId} termId={termId} />
      </div>
    </div>
  );
};
const Stat: React.FC<{ label:string; value:any }> = ({ label, value }) => (
  <div className="px-3 py-2 rounded border bg-white/60 dark:bg-slate-800/60"><div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div><div className="font-semibold text-sm">{value??0}</div></div>
);