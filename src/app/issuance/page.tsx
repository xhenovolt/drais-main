'use client';
/**
 * Issuance dashboard — lists every batch the school has created, grouped
 * by document kind. Same surface for certificates, ID card batches,
 * transcripts, letters. Single source of truth.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, FileCheck, Clock, AlertTriangle, Printer } from 'lucide-react';
import type { IssuanceBatch } from '@/lib/issuance/types';
import { findKind } from '@/lib/drce/kinds';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function IssuanceDashboard() {
  const { t } = useI18n();
  const router = useRouter();
  const [batches, setBatches] = useState<IssuanceBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/issuance/batches');
        const d = await r.json();
        if (!r.ok || !d?.success) throw new Error(d?.error || 'Failed to load');
        setBatches(d.batches ?? []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group by document kind for the Office/Canva-like sectioning.
  const groups = batches.reduce<Record<string, IssuanceBatch[]>>((acc, b) => {
    (acc[b.documentKind] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('issuance.issuance')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('issuance.generateDocuments')} · {t('issuance.auditTrail')}
          </p>
        </div>
        <button
          onClick={() => router.push('/issuance/new')}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 shadow-sm"
        >
          <Plus size={14} /> {t('issuance.newBatch')}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-50 dark:bg-rose-900/20 text-rose-700 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
        </div>
      ) : batches.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 text-sm">
          {t('common.nothingHere')} — <strong>{t('issuance.newBatch')}</strong>.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([kind, list]) => {
            const k = findKind(kind);
            return (
              <section key={kind}>
                <h2 className="text-sm font-bold mb-2 text-slate-700 dark:text-slate-200">
                  <span className="mr-1">{k.icon}</span>{k.label}s
                </h2>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {list.map(b => <Row key={b.id} batch={b} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ batch }: { batch: IssuanceBatch }) {
  const counts = batch.counts;
  const issued = counts?.issued ?? 0;
  return (
    <Link
      href={`/issuance/batches/${batch.id}`}
      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      <StatusIcon status={batch.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">{batch.name}</div>
        <div className="text-[11px] text-slate-400">
          {batch.status}
          {counts && ` · ${counts.candidates} candidates · ${counts.eligible} eligible · ${counts.issued} issued · ${counts.skipped} skipped`}
        </div>
      </div>
      <span className="text-xs text-slate-500">{issued} document{issued === 1 ? '' : 's'}</span>
    </Link>
  );
}

function StatusIcon({ status }: { status: IssuanceBatch['status'] }) {
  switch (status) {
    case 'generated':
    case 'printed':   return <FileCheck size={16} className="text-emerald-500" />;
    case 'previewed':
    case 'generating':
    case 'draft':     return <Clock size={16} className="text-slate-400" />;
    case 'failed':    return <AlertTriangle size={16} className="text-rose-500" />;
    case 'archived':  return <Printer size={16} className="text-slate-300" />;
  }
}
