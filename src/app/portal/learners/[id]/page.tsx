"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Loader, TrendingUp, CalendarCheck, Wallet, BookOpen, FileText,
} from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());
type Tab = 'overview' | 'attendance' | 'results' | 'fees';

function Stat({ icon: Icon, label, value, sub, tone }: any) {
  return (
    <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-1.5">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-3 h-3" /></div>
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      </div>
      <p className="text-base font-bold text-slate-800 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default function PortalLearnerPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');

  const { data: ov } = useSWR(id ? `/api/portal/learners/${id}/overview` : null, fetcher, { revalidateOnFocus: false });
  const { data: att } = useSWR(id && tab === 'attendance' ? `/api/portal/learners/${id}/attendance` : null, fetcher);
  const { data: rez } = useSWR(id && tab === 'results' ? `/api/portal/learners/${id}/results` : null, fetcher);
  const { data: fees } = useSWR(id && tab === 'fees' ? `/api/portal/learners/${id}/fees` : null, fetcher);

  const fmt = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`);
  const money = (n: number | null) => (n == null ? '—' : Number(n).toLocaleString());

  const o = ov?.overview;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/portal" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {(['overview', 'attendance', 'results', 'fees'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              tab === t ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500'
            }`}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        !o ? <Loading /> : (
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={TrendingUp} label="Performance" value={fmt(o.performance.average, '%')}
              sub={o.performance.graded_count ? `${o.performance.graded_count} graded` : 'No marks'} tone="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40" />
            <Stat icon={CalendarCheck} label="Attendance" value={fmt(o.attendance.rate, '%')}
              sub={o.attendance.total_days ? `${o.attendance.present}/${o.attendance.total_days} days` : 'No records'} tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40" />
            <Stat icon={Wallet} label="Fee Balance" value={money(o.fees.balance)}
              sub={o.fees.paid != null ? `Paid ${money(o.fees.paid)}` : 'n/a'}
              tone={o.fees.balance && o.fees.balance > 0 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40'} />
            <Stat icon={BookOpen} label="Subjects" value={fmt(o.subjects.active)} tone="bg-amber-100 text-amber-600 dark:bg-amber-900/40" />
          </div>
        )
      )}

      {tab === 'attendance' && (
        !att ? <Loading /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <MiniStat label="Rate" value={fmt(att.summary?.rate, '%')} />
              <MiniStat label="Present" value={String(att.summary?.present ?? 0)} />
              <MiniStat label="Absent" value={String(att.summary?.absent ?? 0)} />
              <MiniStat label="Late" value={String(att.summary?.late ?? 0)} />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {(att.days ?? []).map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-slate-500">{d.date ? new Date(d.date).toLocaleDateString() : '—'}</span>
                  <span className={`font-semibold capitalize ${
                    d.status === 'present' ? 'text-emerald-600' : d.status === 'absent' ? 'text-rose-600'
                    : d.status === 'late' ? 'text-amber-600' : 'text-slate-500'}`}>{d.status}</span>
                </div>
              ))}
              {(!att.days || att.days.length === 0) && <Empty text="No attendance records." />}
            </div>
          </div>
        )
      )}

      {tab === 'results' && (
        !rez ? <Loading /> : (
          <div className="space-y-3">
            <p className="text-[10px] text-slate-400 flex items-center gap-1"><FileText className="w-3 h-3" /> Released results only</p>
            {(rez.subjects ?? []).length === 0 ? <Empty text="No released results yet." /> : (
              rez.subjects.map((s: any) => (
                <div key={s.subject} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
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
              ))
            )}
          </div>
        )
      )}

      {tab === 'fees' && (
        !fees ? <Loading /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Expected" value={money(fees.fees?.expected)} />
              <MiniStat label="Paid" value={money(fees.fees?.paid)} />
              <MiniStat label="Balance" value={money(fees.fees?.balance)} />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {(fees.payments ?? []).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div>
                    <p className="text-slate-700 dark:text-slate-200 font-medium">{money(p.amount)}</p>
                    <p className="text-[10px] text-slate-400">{p.receipt_no || p.method || '—'}</p>
                  </div>
                  <span className="text-[10px] text-slate-400">{p.at ? new Date(p.at).toLocaleDateString() : ''}</span>
                </div>
              ))}
              {(!fees.payments || fees.payments.length === 0) && <Empty text="No payments recorded." />}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 text-slate-400 py-8 justify-center text-sm"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-xs text-slate-400">{text}</div>;
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center">
      <p className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-sm font-bold text-slate-800 dark:text-white mt-0.5">{value}</p>
    </div>
  );
}
