'use client';

/**
 * Documentation coverage registry — computed on every request from the real route tree
 * (generated index) and the hand-written route documents. Nothing here is typed in by hand:
 * a route is DOCUMENTED only when every section exists and every unit of every file it
 * names is explained, and drops to NEEDS REVIEW the moment one of those files changes.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { DocStatus } from '../routes/RouteDocView';

const routeHref = (url: string) => `/control/docs/routes${url === '/' ? '' : url.split('/').map(encodeURIComponent).join('/')}`;
const ORDER = ['VERIFIED', 'DOCUMENTED', 'NEEDS REVIEW', 'IN PROGRESS', 'NOT STARTED'];

export default function RegistryPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/control-center/docs/registry', { credentials: 'include' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; })
      .then(setD).catch((e) => setErr(e.message));
  }, []);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/control/docs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-300"><ArrowLeft className="h-4 w-4" />Knowledge base</Link>
      <h1 className="text-3xl font-extrabold text-slate-100">Documentation coverage registry</h1>
      <p className="mt-1.5 max-w-3xl text-slate-400">
        Every page route in the build, grouped by sidebar module, with the status of its implementation document. Computed from the code and
        the documents on every load — a route is never marked complete by hand.
      </p>
      {err && <p className="mt-6 rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-sm text-rose-300">{err}</p>}
      {!d && !err && <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Reading the registry…</p>}
      {d && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-5">
            {ORDER.map((s) => (
              <div key={s} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-2xl font-extrabold text-slate-100 tabular-nums">{d.totals[s] ?? 0}</p>
                <DocStatus status={s} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-400">
            {d.pages} page routes. Source files with every unit explained: {d.files.fullyExplained} of {d.files.total}.
            Code units (imports, declarations, statements inside components and handlers) explained: {d.files.unitsExplained.toLocaleString()} of {d.files.units.toLocaleString()} ({pct(d.files.unitsExplained, d.files.units)}%).
          </p>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
            <p className="font-semibold text-slate-100">What each status means</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li><strong className="text-slate-200">NOT STARTED</strong> — no implementation document; only the generated analysis exists.</li>
              <li><strong className="text-slate-200">IN PROGRESS</strong> — a document exists but a template section is missing, a unit of one of its files is unexplained, or a note refers to code that no longer exists.</li>
              <li><strong className="text-slate-200">DOCUMENTED</strong> — every section present and every unit of every listed file explained.</li>
              <li><strong className="text-slate-200">NEEDS REVIEW</strong> — was documented, but a listed file has changed since (content hash differs).</li>
              <li><strong className="text-slate-200">VERIFIED</strong> — documented, unchanged, and the ten practical questions were answered from the document alone.</li>
            </ul>
          </div>

          {d.modules.map((m: any) => (
            <section key={m.key} className="mt-8">
              <h2 className="text-lg font-extrabold text-slate-100">{m.label} <span className="text-sm font-normal text-slate-500">{m.routes.length} routes</span></h2>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-900 text-left text-xs text-slate-400"><th className="px-3 py-2">Route</th><th className="px-3 py-2">Sidebar</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Page units explained</th><th className="px-3 py-2">Files</th><th className="px-3 py-2">Open issues</th></tr></thead>
                  <tbody>
                    {m.routes.map((r: any) => (
                      <tr key={r.url} className="border-t border-slate-800/70 align-top">
                        <td className="px-3 py-1.5"><Link href={routeHref(r.url)} className="font-mono text-xs text-indigo-300 hover:underline">{r.url}</Link></td>
                        <td className="px-3 py-1.5 text-xs text-slate-400">{r.label || '—'}</td>
                        <td className="px-3 py-1.5"><DocStatus status={r.status} reasons={r.reasons} /></td>
                        <td className="px-3 py-1.5 text-xs tabular-nums text-slate-300">{r.explained}/{r.units}</td>
                        <td className="px-3 py-1.5 text-xs tabular-nums text-slate-400">{r.files || '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-500">{r.reasons.slice(0, 2).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
