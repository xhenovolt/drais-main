'use client';
/**
 * /issuance/new — wizard for creating an issuance batch.
 *
 * Step 1: pick template (filter by document_kind).
 * Step 2: name + optional run key + optional scope (class ids).
 * Step 3: build eligibility rule via the existing VisibilityRuleEditor
 *         from P2 — NO new rule language.
 * On submit: POST /api/issuance/batches → navigate to the batch detail
 *            page where the user runs preview → generate → print.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import type { DRCEDocument } from '@/lib/drce/schema';
import { VisibilityRuleEditor } from '@/components/drce/editor/VisibilityRuleEditor';
import type { VisibilityRule } from '@/lib/drce/visibility';
import { findKind, BUILT_IN_KINDS } from '@/lib/drce/kinds';
import { useI18n } from '@/components/i18n/I18nProvider';

interface TemplateRow {
  meta: { id: string; name: string; document_kind?: string };
}

export default function NewIssuancePage() {
  const { t } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
  const presetKind = search.get('kind') ?? 'certificate';

  const [docs,     setDocs]     = useState<TemplateRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [kindFilter, setKindFilter] = useState(presetKind);
  const [chosenTemplateId, setChosenTemplateId] = useState<number | null>(null);
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [runKey,      setRunKey]      = useState('');
  const [classIdsRaw, setClassIdsRaw] = useState('');
  const [rule,        setRule]        = useState<VisibilityRule | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/dvcf/documents');
        const d = await r.json();
        if (d?.documents) setDocs(d.documents as TemplateRow[]);
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(
    () => docs.filter(d => (d.meta.document_kind ?? 'report') === kindFilter),
    [docs, kindFilter],
  );
  const chosenTemplate = docs.find(d => Number(d.meta.id) === chosenTemplateId);

  async function submit() {
    setError(null);
    if (!chosenTemplateId)    { setError('Pick a template first');         return; }
    if (!name.trim())         { setError('Give the batch a name');         return; }
    setSubmitting(true);
    try {
      const classIds = classIdsRaw
        .split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
      const body = {
        templateId:   chosenTemplateId,
        name:         name.trim(),
        description:  description.trim() || undefined,
        documentKind: kindFilter,
        eligibility:  rule,
        scope:        classIds.length ? { classIds } : undefined,
        issuedRunKey: runKey.trim() || undefined,
      };
      const r = await fetch('/api/issuance/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error || 'Could not create batch');
      router.push(`/issuance/batches/${d.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
          <ArrowLeft size={16} className="rtl-flip" />
        </button>
        <Sparkles size={18} className="text-indigo-500" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">{t('issuance.newBatch')}</h1>
      </div>

      {/* Kind filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {BUILT_IN_KINDS
          .filter(k => k.code !== 'blank' && k.code !== 'report')
          .map(k => (
            <button
              key={k.code}
              onClick={() => { setKindFilter(k.code); setChosenTemplateId(null); }}
              className={[
                'inline-flex items-center text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap',
                kindFilter === k.code ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
              ].join(' ')}
            >
              <span className="mr-1">{k.icon}</span>{k.label}
            </button>
          ))}
      </div>

      {/* Template picker */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">1. {t('issuance.selectedTemplate')}</h2>
        {loading ? (
          <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded">
            {t('drce.noTemplatesYet')} — <span className="font-semibold">{findKind(kindFilter).label}</span>.
            <a href="/drce/new" className="text-indigo-600 hover:underline ml-1">{t('drce.chooseStarter')} →</a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map(d => {
              const id = Number(d.meta.id);
              const isPicked = id === chosenTemplateId;
              return (
                <button
                  key={id}
                  onClick={() => setChosenTemplateId(id)}
                  className={[
                    'text-left p-3 rounded border text-sm transition-colors',
                    isPicked
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 text-slate-700 dark:text-slate-300',
                  ].join(' ')}
                >
                  {d.meta.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Batch details */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">2. {t('issuance.batchName')}</h2>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder={`e.g. ${findKind(kindFilter).label}s — Term 3 2026`}
          className="w-full text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
        />
        <input
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder={`${t('common.description')} (${t('common.optional')})`}
          className="w-full text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
        />
        <input
          value={runKey} onChange={e => setRunKey(e.target.value)}
          placeholder="Run key (optional) — e.g. term-3-2026-prefects (used for dedupe)"
          className="w-full text-xs px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 font-mono"
        />
        <input
          value={classIdsRaw} onChange={e => setClassIdsRaw(e.target.value)}
          placeholder="Restrict to class IDs (optional, comma-separated)"
          className="w-full text-xs px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 font-mono"
        />
      </div>

      {/* Eligibility */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          3. {t('issuance.eligibilityRule')}
        </h2>
        <VisibilityRuleEditor
          value={rule}
          onChange={r => setRule(r)}
        />
      </div>

      {error && <div className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 text-xs rounded">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        <button onClick={() => router.back()} className="text-xs text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-500 disabled:opacity-40"
        >
          {submitting ? t('common.processing') : t('actions.create')}
        </button>
      </div>
    </div>
  );
}
