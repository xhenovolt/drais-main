"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  GraduationCap, LogOut, Loader, ChevronRight, UserPlus, School, Clock, CheckCircle2,
} from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function ParentDashboard() {
  const router = useRouter();
  const { data: me, isLoading, mutate } = useSWR('/api/portal/me', fetcher, { revalidateOnFocus: false });
  const { data: learnersData, mutate: mutateLearners } = useSWR(
    me?.success && me.active_school_id ? '/api/portal/learners' : null, fetcher,
  );
  const { data: linkStatus, mutate: mutateLinks } = useSWR('/api/portal/link/status', fetcher);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState('');

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center gap-2 text-slate-400"><Loader className="w-5 h-5 animate-spin" /> Loading…</div>;
  }
  if (!me?.success) {
    if (typeof window !== 'undefined') router.push('/portal/login');
    return null;
  }

  async function pickSchool(schoolId: number) {
    await fetch('/api/portal/context/school', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId }),
    });
    mutate(); mutateLearners();
  }

  async function logout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' });
    router.push('/portal/login');
  }

  async function claim() {
    setClaiming(true); setClaimMsg('');
    try {
      const res = await fetch('/api/portal/link/claim', { method: 'POST' });
      const data = await res.json();
      setClaimMsg(data.message || (data.matched ? 'Request sent.' : 'No match found.'));
      mutate(); mutateLinks(); mutateLearners();
    } finally { setClaiming(false); }
  }

  const schools = me.schools ?? [];
  const learners = learnersData?.learners ?? [];
  const pendingLinks = (linkStatus?.links ?? []).filter((l: any) => l.status === 'pending');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{me.parent?.fullName || me.parent?.phone}</p>
            <p className="text-[11px] text-slate-400">Parent Portal</p>
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      {/* No links at all — claim CTA */}
      {schools.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 text-center shadow-sm">
          <UserPlus className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">Link your child</h2>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            We'll match your phone number against learner records. The school approves access.
          </p>
          <button onClick={claim} disabled={claiming}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            {claiming && <Loader className="w-4 h-4 animate-spin" />} Find my child
          </button>
          {claimMsg && <p className="text-xs text-slate-500 mt-3">{claimMsg}</p>}
        </div>
      )}

      {/* School picker (multi-school parents) */}
      {schools.length > 1 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Choose school</p>
          <div className="grid gap-2">
            {schools.map((s: any) => (
              <button key={s.school_id} onClick={() => pickSchool(s.school_id)}
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                  me.active_school_id === s.school_id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300'
                }`}>
                <div className="flex items-center gap-2">
                  <School className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.school_name}</span>
                </div>
                <span className="text-[11px] text-slate-400">{s.learner_count} learner{s.learner_count === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pending approvals notice */}
      {pendingLinks.length > 0 && (
        <div className="mb-5 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-3 py-2.5">
          <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            {pendingLinks.length} link{pendingLinks.length === 1 ? '' : 's'} awaiting school approval:{' '}
            {pendingLinks.map((l: any) => l.learner_name).join(', ')}
          </div>
        </div>
      )}

      {/* Learners in the active school */}
      {me.active_school_id && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">My children</p>
            <button onClick={claim} disabled={claiming} className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1">
              <UserPlus className="w-3 h-3" /> Add another
            </button>
          </div>
          {learners.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No active learners in this school yet.</p>
          ) : (
            <div className="grid gap-2">
              {learners.map((l: any) => (
                <Link key={l.id} href={`/portal/learners/${l.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
                    {l.photo_url ? <img src={l.photo_url} alt={l.name} className="w-full h-full object-cover" /> : l.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{l.name}</p>
                    <p className="text-[11px] text-slate-400">{[l.class_name, l.admission_no].filter(Boolean).join(' • ')}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </Link>
              ))}
            </div>
          )}
          {claimMsg && <p className="text-xs text-slate-500 mt-3 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{claimMsg}</p>}
        </div>
      )}
    </div>
  );
}
