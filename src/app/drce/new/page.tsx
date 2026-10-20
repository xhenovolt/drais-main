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
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';
import { kindLabel, kindDescription } from '@/lib/i18n/kinds';

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
  const { t } = useI18n();
  const router = useRouter();
  // Built-in starters have fixed English names; a school's own starters stay as entered.
  const starterName = (s: StarterCard) => (s.source === 'built-in' ? t(`drce.newDoc.starter.${s.id}.name`, s.name) : s.name);
  const starterDesc = (s: StarterCard) => (s.source === 'built-in' ? t(`drce.newDoc.starter.${s.id}.desc`, s.description) : s.description);
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
        if (res.ok && d?.success) setStarters(Array.isArray(d.starters) ? d.starters : []);
        else { const m = d?.error; setError((m && !(uiIsArabic() && isEnglishText(m)) ? m : t('drce.newDoc.loadFailed', "Failed to load starters"))); }
      } catch (e) {
        if (!abort) setError(t('drce.newDoc.loadFailed', "Failed to load starters"));
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
      if (q && ![s.name, s.description, starterName(s), starterDesc(s)].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starters, filter, search, t]);

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
      if (!resolve.ok || !rd?.success) throw new Error(rd?.error || t('drce.newDoc.starterFailed', "Could not load starter"));

      const doc  = rd.document;
      const name = window.prompt(t('drce.newDoc.namePrompt', "Name your new document"), t('drce.newDoc.copyName', { name: starterName(starter) }));
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
      if (!create.ok || !cd?.success) throw new Error(cd?.error || t('drce.newDoc.createFailed', "Could not create document"));
      router.push(`/reports/kitchen/drce/${cd.id}`);
    } catch (e) {
      const m = (e as Error).message;
      setError((m && !(uiIsArabic() && isEnglishText(m)) ? m : t('drce.newDoc.createFailed', "Could not create document")));
      setCreating(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/reports/kitchen" title={t('drce.newDoc.back', "Back to Template Kitchen")} aria-label={t('drce.newDoc.back', "Back to Template Kitchen")} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ArrowLeft size={16} className="rtl:-scale-x-100" />
          </Link>
          <Sparkles size={18} className="text-indigo-500" />
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">{t('drce.newDoc.title', "New document")}</h1>
          <span className="text-xs text-slate-400">{t('drce.newDoc.subtitle', "Pick a starter or begin blank.")}</span>
          <div className="flex-1" />
          <div className="relative">
            <Search size={13} className="absolute start-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('drce.newDoc.searchPh', "Search starters…")}
              className="ps-7 pe-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 outline-none focus:ring-1 focus:ring-indigo-400 w-56"
            />
          </div>
        </div>

        {/* Kind filter pills */}
        <div className="max-w-6xl mx-auto px-4 pb-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={pillCls(filter === 'all')}
          >{t('drce.newDoc.all', "All")}</button>
          {availableKinds.map(k => (
            <button key={k.code} onClick={() => setFilter(k.code)} className={pillCls(filter === k.code)}>
              <span className="me-1">{k.icon}</span>{kindLabel(t, k)}
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
            <Loader2 size={14} className="animate-spin" /> {t('drce.newDoc.loading', "Loading starters…")}
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            {t('drce.newDoc.none', "No starters match your filter.")}
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([kind, list]) => {
              const k = findKind(kind);
              return (
                <section key={kind}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h2 className="text-base font-bold text-slate-800 dark:text-white">
                      <span className="me-1">{k.icon}</span>{kindLabel(t, k)}
                    </h2>
                    <span className="text-xs text-slate-400">{kindDescription(t, k)}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map(s => (
                      <button
                        key={s.id}
                        onClick={() => pickStarter(s)}
                        disabled={creating !== null}
                        className="text-start p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-indigo-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-start gap-2 mb-1">
                          <span className="text-2xl">{s.kindIcon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-semibold text-sm text-slate-800 dark:text-white truncate">{starterName(s)}</h3>
                              {s.source === 'school' && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">{t('drce.newDoc.school', "School")}</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{starterDesc(s)}</p>
                          </div>
                        </div>
                        {creating === s.id && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-600">
                            <Loader2 size={11} className="animate-spin" /> {t('drce.newDoc.creating', "Creating…")}
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
