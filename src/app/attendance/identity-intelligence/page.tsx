'use client';

/**
 * Identity Intelligence (Phase 8) — device-identity health at a glance.
 * Duplicate mappings, unknown PINs and stale enrollments, each with a
 * proposed action. Nothing changes here; actions route to Identity Matching
 * where a human confirms.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, RefreshCw, Loader2, GitMerge, UserPlus, Clock, ArrowRight } from 'lucide-react';

const SEV_STYLE: Record<string, string> = {
  high: 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20',
  medium: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
  low: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
};
const ACTION_ICON: Record<string, React.ReactNode> = {
  merge: <GitMerge className="w-4 h-4 text-rose-500" />,
  map: <UserPlus className="w-4 h-4 text-amber-500" />,
  review: <Clock className="w-4 h-4 text-gray-400" />,
};

export default function IdentityIntelligence() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await (await fetch('/api/attendance/identity-intelligence', { cache: 'no-store' })).json()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const health = data?.health;
  const issues = data?.issues || [];
  const scoreColor = !health ? 'text-gray-400'
    : health.band === 'clean' ? 'text-emerald-600 dark:text-emerald-400'
      : health.band === 'minor' ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Fingerprint className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Identity Intelligence</h1>
            <p className="text-sm text-gray-500">Device-to-person mapping health — DRAIS proposes fixes; you confirm them.</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-scan</button>
      </div>

      {loading && !data && <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 inline" /></div>}

      {health && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-5 flex-wrap">
          <div className="text-center">
            <div className={`text-5xl font-extrabold tabular-nums ${scoreColor}`}>{health.score}<span className="text-xl">%</span></div>
            <div className="text-[11px] text-gray-400 uppercase">{health.band === 'clean' ? 'Clean' : health.band === 'minor' ? 'Minor issues' : 'Needs attention'}</div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm text-gray-700 dark:text-gray-200">{health.summary}</p>
            {data?.counts && (
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                <span>{data.counts.duplicates} duplicate</span>
                <span>{data.counts.unknowns} unknown</span>
                <span>{data.counts.stales} stale</span>
              </div>
            )}
            <a href="/attendance/identity-matching" className="inline-flex items-center gap-1 mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Open Identity Matching to apply fixes <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {data && issues.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No identity issues — every device PIN maps cleanly.</p>}
        {issues.map((i: any, idx: number) => (
          <div key={idx} className={`rounded-xl border p-3.5 ${SEV_STYLE[i.severity]}`}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{ACTION_ICON[i.action]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {i.subject}
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">{i.action}</span>
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{i.detail}</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">→ {i.recommendation}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Duplicate people — guided merge (Phase B) */}
      <DuplicatePeople />
    </div>
  );
}

/** Guided merge of duplicate person records — pick keeper, preview, merge. */
function DuplicatePeople() {
  const [groups, setGroups] = useState<any[] | null>(null);
  const load = useCallback(async () => {
    try { const j = await (await fetch('/api/attendance/person-merge', { cache: 'no-store' })).json(); setGroups(j.groups || []); }
    catch { setGroups([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!groups) return null;
  if (groups.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-1.5">
        <GitMerge className="w-4 h-4 text-rose-500" /> Duplicate people
        <span className="text-[11px] font-normal text-gray-400">({groups.length} name{groups.length === 1 ? '' : 's'} appear more than once — attendance is split)</span>
      </p>
      <p className="text-[11px] text-gray-400 mb-2">Pick the record to keep; the others merge into it (all attendance moves over) and are moved to Trash. Reversible + audited.</p>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {groups.map((g, i) => <DupGroup key={i} group={g} onMerged={load} />)}
      </div>
    </div>
  );
}

function DupGroup({ group, onMerged }: { group: any; onMerged: () => void }) {
  const withRole = group.members.filter((m: any) => m.role !== 'none');
  const [keeper, setKeeper] = useState<number>(withRole[0]?.person_id ?? group.members[0]?.person_id);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const losers = group.members.filter((m: any) => m.person_id !== keeper).map((m: any) => m.person_id);
  const keeperMember = group.members.find((m: any) => m.person_id === keeper);

  const doPreview = async () => {
    setBusy(true);
    try { const j = await (await fetch('/api/attendance/person-merge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', keeper_person_id: keeper, loser_person_ids: losers }) })).json(); setPreview(j.success ? j : null); }
    finally { setBusy(false); }
  };
  const doMerge = async () => {
    if (!keeperMember || keeperMember.role === 'none') { alert('Keeper must be a real staff/learner record.'); return; }
    if (!confirm(`Merge ${losers.length} duplicate(s) into ${group.name}? Attendance moves over; the duplicates go to Trash (restorable).`)) return;
    setBusy(true);
    try {
      const j = await (await fetch('/api/attendance/person-merge', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'merge', keeper_role: keeperMember.role, keeper_ref_id: keeperMember.ref_id, keeper_person_id: keeper, loser_person_ids: losers }) })).json();
      if (j.success) { alert(`Merged ${j.merged} duplicate(s); ${j.events} events moved.`); onMerged(); }
      else alert(j.error || 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-2.5">
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">{group.name}</p>
      <div className="space-y-1">
        {group.members.map((m: any) => (
          <label key={m.person_id} className="flex items-center justify-between text-xs cursor-pointer">
            <span className="flex items-center gap-1.5">
              <input type="radio" name={`keep-${group.name}`} checked={keeper === m.person_id} onChange={() => { setKeeper(m.person_id); setPreview(null); }} disabled={m.role === 'none'} />
              <span className="text-gray-700 dark:text-gray-200">#{m.person_id}</span>
              <span className={`text-[10px] px-1 rounded ${m.role === 'none' ? 'bg-gray-100 text-gray-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{m.role}</span>
            </span>
            <span className="text-gray-400">{m.events} events · {m.enrollments} PIN(s)</span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        {preview ? <span className="text-[11px] text-indigo-600 dark:text-indigo-400">Merges {preview.losers} record(s): {preview.events} events, {preview.records} verdicts move in.</span> : <span className="text-[11px] text-gray-400">Keeper: #{keeper}</span>}
        <div className="flex gap-1.5">
          {!preview
            ? <button onClick={doPreview} disabled={busy || losers.length === 0} className="text-[11px] px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium disabled:opacity-50">Preview</button>
            : <button onClick={doMerge} disabled={busy} className="text-[11px] px-2.5 py-1 rounded bg-rose-600 text-white font-medium disabled:opacity-50">{busy ? 'Merging…' : `Merge ${losers.length} in`}</button>}
        </div>
      </div>
    </div>
  );
}
