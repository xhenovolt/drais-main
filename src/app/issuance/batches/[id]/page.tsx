'use client';
/**
 * /issuance/batches/[id] — operate a batch through its lifecycle.
 *   draft → preview → generate → print
 *
 * Renders the candidate list with status per item. From here the user
 * runs each step and finally opens the print view.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Eye, Sparkles, Printer, RefreshCw } from 'lucide-react';
import type { IssuanceBatch, IssuanceItem } from '@/lib/issuance/types';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

export default function BatchDetailPage() {
  const { t, digits } = useI18n();
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const batchId = Number(params.id);

  const [batch, setBatch] = useState<IssuanceBatch | null>(null);
  const [items, setItems] = useState<IssuanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'preview' | 'generate'>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/issuance/batches/${batchId}`);
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error || '');
      setBatch(d.batch); setItems(Array.isArray(d.items) ? d.items : []);
    } catch (e) {
      const m = (e as Error).message;
      setError((m && !(uiIsArabic() && isEnglishText(m)) ? m : t('issuancePages.loadFailed', "Failed to load")));
    } finally {
      setLoading(false);
    }
  }, [batchId]);
  useEffect(() => { void load(); }, [load]);

  async function run(verb: 'preview' | 'generate') {
    setBusy(verb); setError(null);
    try {
      const r = await fetch(`/api/issuance/batches/${batchId}/${verb}`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error || '');
      await load();
    } catch (e) {
      const m = (e as Error).message;
      setError((m && !(uiIsArabic() && isEnglishText(m)) ? m : t('issuancePages.verbFailed', "The action could not be completed.")));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t('common.loading')}</div>;
  if (!batch)  return <div className="p-6 text-sm text-rose-600">{t('messages.notFound')}</div>;

  const issuedCount = items.filter(i => i.status === 'issued' || i.status === 'reprinted').length;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} title={t('issuancePages.back', "Back")} aria-label={t('issuancePages.back', "Back")} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
          <ArrowLeft size={16} className="rtl-flip" />
        </button>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">{batch.name}</h1>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-semibold bg-indigo-50 text-indigo-700">
          {t(`issuancePages.st.${batch.status}`, batch.status)}
        </span>
      </div>

      {batch.counts && (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><strong className="text-slate-700 dark:text-slate-200">{digits(batch.counts.candidates ?? 0)}</strong> {t('issuancePages.c.candidates', "candidates")}</span>
          <span>·</span>
          <span><strong className="text-emerald-600">{digits(batch.counts.eligible ?? 0)}</strong> {t('issuancePages.c.eligible', "eligible")}</span>
          <span>·</span>
          <span><strong className="text-emerald-600">{digits(batch.counts.issued ?? 0)}</strong> {t('issuancePages.c.issued', "issued")}</span>
          <span>·</span>
          <span><strong className="text-slate-400">{digits(batch.counts.skipped ?? 0)}</strong> {t('issuancePages.c.skipped', "skipped")}</span>
          {batch.counts.errored > 0 && <>
            <span>·</span>
            <span><strong className="text-rose-600">{digits(batch.counts.errored)}</strong> {t('issuancePages.c.errored', "errored")}</span>
          </>}
        </div>
      )}

      {error && <div className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 text-xs rounded">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          onClick={() => run('preview')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded"
        >
          {busy === 'preview' ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
          {t('actions.preview')}
        </button>
        <button
          onClick={() => run('generate')}
          disabled={busy !== null || batch.status === 'draft'}
          title={batch.status === 'draft' ? t('issuancePages.previewFirst', "Run preview first") : ''}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'generate' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {t('issuance.generateDocuments')}
        </button>
        {issuedCount > 0 && (
          <a
            href={`/issuance/batches/${batchId}/print`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded"
          >
            <Printer size={12} /> {t('actions.print')} ({digits(issuedCount)})
          </a>
        )}
        <button
          onClick={() => load()}
          className="ms-auto text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
        >
          <RefreshCw size={11} /> {t('actions.refresh')}
        </button>
      </div>

      {/* Item list */}
      {items.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {items.map(it => {
            const snap = it.recipientSnapshot as { fullName?: string; admissionNo?: string; className?: string } | null;
            return (
              <div key={it.id} className="flex items-center gap-3 p-2.5">
                <ItemStatusPill status={it.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {snap?.fullName ?? t('issuancePages.recipientN', { id: it.recipientId })}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {snap?.admissionNo} · {snap?.className}
                    {it.skipReason  && <> · {t('issuancePages.skippedReason', { reason: it.skipReason === 'eligibility rule returned false' ? t('issuancePages.reason.rule', it.skipReason) : it.skipReason === 'already issued under this run key' ? t('issuancePages.reason.runKey', it.skipReason) : it.skipReason })}</>}
                    {it.errorMessage && <> · {t('issuancePages.errorReason', { reason: it.errorMessage })}</>}
                  </div>
                </div>
                {it.reprintCount > 0 && (
                  <span className="text-[10px] text-slate-400">{t('issuancePages.reprinted', { n: it.reprintCount })}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemStatusPill({ status }: { status: IssuanceItem['status'] }) {
  const { t } = useI18n();
  const map: Record<IssuanceItem['status'], { label: string; cls: string }> = {
    eligible:  { label: t('issuancePages.item.eligible', "eligible"),  cls: 'bg-emerald-100 text-emerald-700' },
    issued:    { label: t('issuancePages.item.issued', "issued"),    cls: 'bg-indigo-100 text-indigo-700' },
    reprinted: { label: t('issuancePages.item.reprinted', "reprinted"), cls: 'bg-blue-100 text-blue-700' },
    skipped:   { label: t('issuancePages.item.skipped', "skipped"),   cls: 'bg-slate-100 text-slate-500' },
    errored:   { label: t('issuancePages.item.errored', "errored"),   cls: 'bg-rose-100 text-rose-700' },
  };
  const m = map[status] ?? { label: String(status), cls: 'bg-slate-100 text-slate-500' };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
}
