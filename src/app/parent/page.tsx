'use client';
/**
 * /parent — dashboard. All linked learners across all schools, grouped by
 * school. Each card links to the learner detail view. Pure client fetch;
 * redirects to /parent/login if there's no session.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, CalendarCheck, Wallet, TrendingUp, ChevronRight, LogOut, School, Loader } from 'lucide-react';

interface Card {
  learner_access_id: string;
  learner_name: string;
  school_name: string;
  class_name: string | null;
  stream_name: string | null;
  relationship: string | null;
  summary: {
    attendance_today: string | null;
    fees: { visible: boolean; balance: number | null };
    academic_average: number | null;
  };
}
interface Group { school: string; learners: Card[]; }

const money = (n: number | null) => n == null ? '—' : `UGX ${Number(n).toLocaleString()}`;
const pct = (n: number | null) => n == null ? '—' : `${n}%`;

export default function ParentDashboard() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/parent/learners')
      .then(async (r) => {
        if (r.status === 401) { router.replace('/parent/login'); return null; }
        return r.json();
      })
      .then((d) => { if (!d) return; setGroups(d.grouped_by_school ?? []); setCount(d.learner_count ?? 0); })
      .catch(() => setErr('Could not load your learners.'));
  }, [router]);

  async function logout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/parent/login');
  }

  return (
    <div className="px-4 py-5 pb-16">
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 dark:text-white leading-tight">My Children</h1>
            <p className="text-[11px] text-slate-400">{count} learner{count === 1 ? '' : 's'}{groups && groups.length > 1 ? ` · ${groups.length} schools` : ''}</p>
          </div>
        </div>
        <button onClick={logout} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Sign out">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {!groups && !err && (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader className="w-5 h-5 animate-spin" /></div>
      )}

      {groups && groups.length === 0 && (
        <div className="text-center py-16 px-6">
          <p className="text-sm text-slate-500">No learners are linked to your number yet.</p>
          <p className="text-xs text-slate-400 mt-2">Ask your child&apos;s school to add your phone number to their contact record, then sign in again.</p>
        </div>
      )}

      {count > 1 && (
        <Link href="/parent/compare" className="mb-4 flex items-center justify-between rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Compare my children</span>
          <ChevronRight className="w-4 h-4 text-indigo-500" />
        </Link>
      )}

      <div className="space-y-5">
        {groups?.map((g) => (
          <section key={g.school}>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <School className="w-3.5 h-3.5 text-slate-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g.school}</h2>
            </div>
            <div className="space-y-3">
              {g.learners.map((c) => (
                <Link key={c.learner_access_id} href={`/parent/learners/${c.learner_access_id}`}
                  className="block rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 active:scale-[.99] transition">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">{c.learner_name}</p>
                      <p className="text-[11px] text-slate-400">
                        {[c.class_name, c.stream_name].filter(Boolean).join(' · ') || 'Class not set'}
                        {c.relationship ? ` · ${c.relationship}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Mini icon={CalendarCheck} label="Today" value={c.summary.attendance_today ?? '—'} />
                    <Mini icon={TrendingUp} label="Average" value={pct(c.summary.academic_average)} />
                    <Mini icon={Wallet} label="Balance" value={c.summary.fees.visible ? money(c.summary.fees.balance) : 'Hidden'} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Mini({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-2 py-2 text-center">
      <Icon className="w-3.5 h-3.5 mx-auto text-slate-400 mb-1" />
      <p className="text-[10px] text-slate-400 leading-none mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 capitalize truncate">{value}</p>
    </div>
  );
}
