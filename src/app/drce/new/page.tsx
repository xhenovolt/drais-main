'use client';
/**
 * Office/Canva-style "+ New Document" gallery.
 *
 * Lists every starter (built-in + school-saved) grouped by document kind.
 * Pick one → calls the create-from-starter handler:
 *   1. resolve the starter's DRCEDocument via /api/drce/starters/:id
 *   2. POST it to /api/dvcf/documents with the right document_kind
 *   3. navigate the user into the editor for the new doc
 *
 * No new render code — the editor handles everything from there.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, Search } from 'lucide-react';
import { BUILT_IN_KINDS, findKind } from '@/lib/drce/kinds';

interface StarterCard {
  id:           string;
  source:       'built-in' | 'school';
  name:         string;
  description:  string;
  kind:         string;
  kindLabel:    string;
  kindIcon:     string;
  sortOrder:    number;
  thumbnailUrl: string | null;
}

export default function DRCENewDocumentPage() {
  const router = useRouter();
  const [starters, setStarters] = useState<StarterCard[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<string>('all');
  const [search,   setSearch]   = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await fetch('/api/drce/starters');
        const d   = await res.json();
        if (abort) return;
        if (res.ok && d?.success) setStarters(d.starters ?? []);
        else setError(d?.error ?? 'Failed to load starters');
      } catch (e) {
        if (!abort) setError((e as Error).message);
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return starters.filter(s => {
      if (filter !== 'all' && s.kind !== filter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [starters, filter, search]);

  // Group visible starters by kind for display.
  const grouped = useMemo(() => {
    const map = new Map<string, StarterCard[]>();
    for (const s of visible) {
      if (!map.has(s.kind)) map.set(s.kind, []);
      map.get(s.kind)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      (findKind(a).sortOrder ?? 999) - (findKind(b).sortOrder ?? 999),
    );
  }, [visible]);

  // Kinds with at least one starter — used for the filter pill bar.
  const availableKinds = useMemo(() => {
    const set = new Set(starters.map(s => s.kind));
    return BUILT_IN_KINDS
      .filter(k => set.has(k.code))
      .concat(
        Array.from(set)
          .filter(c => !BUILT_IN_KINDS.some(k => k.code === c))
          .map(c => findKind(c)),
      );
  }, [starters]);

  async function pickStarter(starter: StarterCard) {
    setCreating(starter.id);
    setError(null);
    try {
      const resolve = await fetch(`/api/drce/starters/${encodeURIComponent(starter.id)}`);
      const rd      = await resolve.json();
      if (!resolve.ok || !rd?.success) throw new Error(rd?.error || 'Could not load starter');

      const doc  = rd.document;
      const name = window.prompt('Name your new document', `${starter.name} — copy`);
      if (name === null) { setCreating(null); return; }
      doc.meta = { ...doc.meta, name };

      const create = await fetch('/api/dvcf/documents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name,
          description:   starter.description,
          schema_json:   JSON.stringify(doc),
          document_type: 'report_card',
          document_kind: starter.kind,
        }),
      });
      const cd = await create.json();
      if (!create.ok || !cd?.success) throw new Error(cd?.error || 'Could not create document');
      router.push(`/reports/kitchen/drce/${cd.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/reports/kitchen" className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ArrowLeft size={16} />
          </Link>
          <Sparkles size={18} className="text-indigo-500" />
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">New document</h1>
          <span className="text-xs text-slate-400">Pick a starter or begin blank.</span>
          <div className="flex-1" />
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search starters…"
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 outline-none focus:ring-1 focus:ring-indigo-400 w-56"
            />
          </div>
        </div>

        {/* Kind filter pills */}
        <div className="max-w-6xl mx-auto px-4 pb-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={pillCls(filter === 'all')}
          >All</button>
          {availableKinds.map(k => (
            <button key={k.code} onClick={() => setFilter(k.code)} className={pillCls(filter === k.code)}>
              <span className="mr-1">{k.icon}</span>{k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading starters…
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No starters match your filter.
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([kind, list]) => {
              const k = findKind(kind);
              return (
                <section key={kind}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h2 className="text-base font-bold text-slate-800 dark:text-white">
                      <span className="mr-1">{k.icon}</span>{k.label}
                    </h2>
                    <span className="text-xs text-slate-400">{k.description}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map(s => (
                      <button
                        key={s.id}
                        onClick={() => pickStarter(s)}
                        disabled={creating !== null}
                        className="text-left p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-indigo-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-start gap-2 mb-1">
                          <span className="text-2xl">{s.kindIcon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-semibold text-sm text-slate-800 dark:text-white truncate">{s.name}</h3>
                              {s.source === 'school' && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">School</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{s.description}</p>
                          </div>
                        </div>
                        {creating === s.id && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-600">
                            <Loader2 size={11} className="animate-spin" /> Creating…
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function pillCls(active: boolean) {
  return [
    'inline-flex items-center text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap',
    active
      ? 'bg-indigo-600 text-white'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
  ].join(' ');
}
