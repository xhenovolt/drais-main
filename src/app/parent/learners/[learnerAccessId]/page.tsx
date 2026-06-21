'use client';
/**
 * /parent/learners/[learnerAccessId] — learner detail. Tabs: attendance,
 * academics, fees, receipts, reports. Data via /api/parent/learners/[id]/*.
 */
import React, { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck, TrendingUp, Wallet, Receipt, FileText } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const money = (n: number | null | undefined) => n == null ? '—' : `UGX ${Number(n).toLocaleString()}`;
type Tab = 'attendance' | 'academics' | 'fees' | 'receipts' | 'reports';
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'academics',  label: 'Academics',  icon: TrendingUp },
  { key: 'fees',       label: 'Fees',        icon: Wallet },
  { key: 'receipts',   label: 'Receipts',    icon: Receipt },
  { key: 'reports',    label: 'Reports',     icon: FileText },
];

export default function LearnerDetail({ params }: { params: Promise<{ learnerAccessId: string }> }) {
  const { learnerAccessId: id } = use(params);
  const [tab, setTab] = useState<Tab>('attendance');
  const base = `/api/parent/learners/${id}`;

  const { data: list } = useSWR('/api/parent/learners', fetcher);
  const card = list?.learners?.find((l: any) => l.learner_access_id === id);
  const { data } = useSWR(`${base}/${tab}`, fetcher);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 pb-16 md:px-6 md:py-8">
      <header className="flex items-center gap-2 mb-4">
        <Link href="/parent" className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-base font-bold text-slate-800 dark:text-white leading-tight">{card?.learner_name ?? 'Learner'}</h1>
          <p className="text-[11px] text-slate-400">{card ? [card.school_name, card.class_name, card.stream_name].filter(Boolean).join(' · ') : ''}</p>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto mb-4 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {!data ? <Loading /> : (
        <>
          {tab === 'attendance' && <Attendance data={data} />}
          {tab === 'academics'  && <Academics data={data} />}
          {tab === 'fees'       && <Fees data={data} />}
          {tab === 'receipts'   && <Receipts data={data} />}
          {tab === 'reports'    && <Reports data={data} />}
        </>
      )}
    </div>
  );
}

function Loading() { return <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>; }
function Empty({ text }: { text: string }) { return <div className="py-12 text-center text-slate-400 text-sm">{text}</div>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">{children}</div>; }
function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-2 py-2 text-center"><p className="text-[10px] text-slate-400">{label}</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200 capitalize">{value}</p></div>;
}

function Attendance({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Rate" value={data.summary?.rate == null ? '—' : `${data.summary.rate}%`} />
        <MiniStat label="Present" value={String(data.summary?.present ?? 0)} />
        <MiniStat label="Absent" value={String(data.summary?.absent ?? 0)} />
        <MiniStat label="Late" value={String(data.summary?.late ?? 0)} />
      </div>
      <Card>
        {(data.days ?? []).map((d: any, i: number) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-slate-500">{d.date ? new Date(d.date).toLocaleDateString() : '—'}</span>
            <span className={`font-semibold capitalize ${d.status === 'present' ? 'text-emerald-600' : d.status === 'absent' ? 'text-rose-600' : d.status === 'late' ? 'text-amber-600' : 'text-slate-500'}`}>{d.status}</span>
          </div>
        ))}
        {(!data.days || data.days.length === 0) && <Empty text="No attendance records." />}
      </Card>
    </div>
  );
}

function Academics({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-400 flex items-center gap-1"><FileText className="w-3 h-3" /> Released results only</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(data.subjects ?? []).length === 0 ? <Empty text="No released results yet." /> : data.subjects.map((s: any) => (
        <div key={s.subject} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">{s.subject}</p>
          <div className="space-y-1">
            {s.results.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-500 truncate">{r.exam}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{r.score}{r.grade ? ` (${r.grade})` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

function Fees({ data }: { data: any }) {
  if (data.visible === false) return <Empty text="Fee information is not shared with parents by this school." />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Expected" value={money(data.fees?.expected)} />
        <MiniStat label="Paid" value={money(data.fees?.paid)} />
        <MiniStat label="Balance" value={money(data.fees?.balance)} />
      </div>
      <Card>
        {(data.payments ?? []).map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
            <div><p className="font-medium text-slate-700 dark:text-slate-200">{money(p.amount)}</p><p className="text-[10px] text-slate-400">{p.receipt_no || p.method || '—'}</p></div>
            <span className="text-[10px] text-slate-400">{p.at ? new Date(p.at).toLocaleDateString() : ''}</span>
          </div>
        ))}
        {(!data.payments || data.payments.length === 0) && <Empty text="No payments recorded." />}
      </Card>
    </div>
  );
}

function Receipts({ data }: { data: any }) {
  if (data.visible === false) return <Empty text="Fee information is not shared with parents by this school." />;
  return (
    <Card>
      {(data.receipts ?? []).map((r: any) => (
        <div key={r.id} className="flex items-center justify-between px-3 py-2.5 text-xs">
          <div><p className="font-medium text-slate-700 dark:text-slate-200">{r.receipt_no}</p><p className="text-[10px] text-slate-400">{r.method || '—'} · {r.at ? new Date(r.at).toLocaleDateString() : ''}</p></div>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{money(r.amount)}</span>
        </div>
      ))}
      {(!data.receipts || data.receipts.length === 0) && <Empty text="No receipts yet." />}
    </Card>
  );
}

function Reports({ data }: { data: any }) {
  return (
    <Card>
      {(data.reports ?? []).map((r: any) => (
        <div key={r.id} className="flex items-center justify-between px-3 py-3 text-xs">
          <div><p className="font-medium text-slate-700 dark:text-slate-200 capitalize">{r.type} report</p><p className="text-[10px] text-slate-400">{[r.term, r.year].filter(Boolean).join(' · ')}</p></div>
          <span className="text-[10px] text-slate-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
        </div>
      ))}
      {(!data.reports || data.reports.length === 0) && <Empty text="No published reports yet." />}
    </Card>
  );
}
