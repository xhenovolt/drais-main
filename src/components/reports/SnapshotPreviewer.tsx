'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Printer, ChevronLeft, ChevronRight, Layers, Loader2 } from 'lucide-react';
import type { ReportSnapshot, SnapshotType } from '@/lib/snapshots/types';
import type { DRCEDocument } from '@/lib/drce/schema';
import type { RegistryEntry } from '@/lib/drce/registry';
import { DRCEDocumentRenderer } from '@/components/drce/DRCEDocumentRenderer';
import { snapshotToDRCEDataContext } from '@/lib/snapshots/adapter/toDRCEDataContext';
import {
  applyOverrides,
  readHiddenSubjectIds,
  selectOverridesForStudent,
  type PersistedOverride,
} from '@/lib/drce/overrides';
import { OverridesPanel } from './OverridesPanel';

export interface SnapshotPreviewerProps {
  snapshot: ReportSnapshot;
}

type Mode = 'emergency' | 'drce';

const DEFAULT_EMERGENCY_BY_TYPE: Record<SnapshotType, string> = {
  secular:  'emergency-secular',
  theology: 'emergency-theology',
  mixed:    'emergency-secular',
};

/**
 * Class-paginated snapshot preview with two render modes:
 *   - 'emergency': iframe of the deterministic print route. Pixel-identical
 *     to print output. Always works, no DRCE dependency.
 *   - 'drce':       skinned React render via DRCEDocumentRenderer using the
 *     active dvcf_documents document. Switch templates without regenerating.
 */
export function SnapshotPreviewer({ snapshot }: SnapshotPreviewerProps) {
  const [classIdx, setClassIdx]     = useState<number>(0);
  const [studentIdx, setStudentIdx] = useState<number>(0);
  const [mode, setMode]             = useState<Mode>('emergency');
  const [drceDoc, setDrceDoc]       = useState<DRCEDocument | null>(null);
  const [drceError, setDrceError]   = useState<string | null>(null);
  const [drceLoading, setDrceLoading] = useState<boolean>(false);

  // Registry-driven template selection. Loaded once; the dropdown is filtered
  // to entries compatible with the snapshot's curriculum type.
  const [registry, setRegistry]     = useState<RegistryEntry[]>([]);
  const [emergencyTemplateId, setEmergencyTemplateId] = useState<string>(
    DEFAULT_EMERGENCY_BY_TYPE[snapshot.meta.type],
  );
  const [drceTemplateId, setDrceTemplateId] = useState<string>('');
  // Phase 3.1 — per-snapshot override set. Snapshot-bound; cascades when
  // the snapshot is flushed. Refetched whenever a write happens.
  const [overrides, setOverrides]   = useState<PersistedOverride[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/drce/registry?document_type=report_card')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (Array.isArray(json?.templates)) setRegistry(json.templates as RegistryEntry[]);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Load the snapshot's override set on mount + whenever the snapshot id
  // changes. Reused after each write via reloadOverrides() below so the
  // panel always reflects canonical server state.
  const reloadOverrides = useMemo(() => {
    return async () => {
      const r = await fetch(`/api/snapshots/${encodeURIComponent(snapshot.meta.snapshotId)}/overrides`);
      const json = await r.json().catch(() => ({}));
      if (Array.isArray(json?.overrides)) setOverrides(json.overrides as PersistedOverride[]);
    };
  }, [snapshot.meta.snapshotId]);

  useEffect(() => {
    let cancelled = false;
    reloadOverrides().catch(() => undefined).then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [reloadOverrides]);

  // emergency_html renderer covers Phase 2 categories: emergency, arabic,
  // legacy_rpt. Filter to those compatible with this snapshot's curriculum.
  const emergencyOptions = useMemo(
    () => registry.filter(t =>
      t.renderer === 'emergency_html' &&
      t.supportedTypes.includes(snapshot.meta.type),
    ),
    [registry, snapshot.meta.type],
  );

  const drceOptions = useMemo(
    () => registry.filter(t => t.renderer === 'drce'),
    [registry],
  );

  const selectedEmergency = useMemo(
    () => emergencyOptions.find(t => t.id === emergencyTemplateId) ?? null,
    [emergencyOptions, emergencyTemplateId],
  );

  const printBase = `/academics/report-cards/${snapshot.meta.type}/${snapshot.meta.snapshotId}/print`;
  const classes = snapshot.classes;
  const cls     = classes[classIdx];
  const stu     = cls?.students[studentIdx];

  const previewSrc = useMemo(() => {
    if (!cls) return printBase;
    return `${printBase}?class_id=${classIdx}&template=${encodeURIComponent(emergencyTemplateId)}`;
  }, [printBase, classIdx, cls, emergencyTemplateId]);

  useEffect(() => {
    setStudentIdx(0);
  }, [classIdx]);

  useEffect(() => {
    if (mode !== 'drce') return;
    let cancelled = false;
    setDrceLoading(true);
    setDrceError(null);

    const url = drceTemplateId
      ? `/api/dvcf/documents/${encodeURIComponent(drceTemplateId)}`
      : '/api/dvcf/active?type=report_card';

    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (json?.document) setDrceDoc(json.document as DRCEDocument);
        else setDrceError('No active DRCE template configured');
        setDrceLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setDrceError(e?.message || 'Failed to load DRCE template');
        setDrceLoading(false);
      });
    return () => { cancelled = true; };
  }, [mode, drceTemplateId]);

  if (classes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
        This snapshot contains no classes.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setClassIdx(i => Math.max(0, i - 1))}
            disabled={classIdx === 0}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
            aria-label="Previous class"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={classIdx}
            onChange={e => setClassIdx(Number(e.target.value))}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
          >
            {classes.map((c, i) => (
              <option key={c.classId} value={i}>
                {c.className} ({c.students.length} students)
              </option>
            ))}
          </select>
          <button
            onClick={() => setClassIdx(i => Math.min(classes.length - 1, i + 1))}
            disabled={classIdx === classes.length - 1}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
            aria-label="Next class"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {mode === 'drce' && cls && (
            <select
              value={studentIdx}
              onChange={e => setStudentIdx(Number(e.target.value))}
              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
            >
              {cls.students.map((s, i) => (
                <option key={s.studentDbId} value={i}>
                  #{s.position} · {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'emergency' && emergencyOptions.length > 1 && (
            <select
              value={emergencyTemplateId}
              onChange={e => setEmergencyTemplateId(e.target.value)}
              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
              title="Pick a template"
            >
              {(['emergency','arabic','legacy_rpt'] as const).map(cat => {
                const opts = emergencyOptions.filter(t => t.category === cat);
                if (opts.length === 0) return null;
                return (
                  <optgroup
                    key={cat}
                    label={
                      cat === 'emergency'  ? 'Emergency' :
                      cat === 'arabic'     ? 'Arabic / RTL' :
                                             'Legacy rpt.html'
                    }
                  >
                    {opts.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          )}
          {mode === 'emergency' && selectedEmergency && (
            <CategoryBadge category={selectedEmergency.category} />
          )}
          {mode === 'drce' && drceOptions.length > 0 && (
            <select
              value={drceTemplateId}
              onChange={e => setDrceTemplateId(e.target.value)}
              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
              title="Pick a DRCE template"
            >
              <option value="">— school default —</option>
              {drceOptions.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden text-xs">
            <button
              onClick={() => setMode('emergency')}
              className={`px-2.5 py-1 ${mode === 'emergency' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              Emergency
            </button>
            <button
              onClick={() => setMode('drce')}
              disabled={drceOptions.length === 0}
              className={`px-2.5 py-1 inline-flex items-center gap-1 ${mode === 'drce' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={drceOptions.length === 0 ? 'No DRCE template configured' : 'DRCE renderer'}
            >
              <Layers className="w-3.5 h-3.5" /> DRCE
            </button>
          </div>
          <Link
            href={`${printBase}?class_id=${classIdx}&template=${encodeURIComponent(emergencyTemplateId)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
          >
            <Printer className="w-4 h-4" /> Print this class
          </Link>
        </div>
      </div>

      {mode === 'emergency' && (
        <iframe
          key={previewSrc}
          src={previewSrc}
          title={`Snapshot preview — ${cls?.className}`}
          className="w-full"
          style={{ height: '80vh', minHeight: 600, border: 0 }}
        />
      )}

      {mode === 'drce' && (
        <div className="bg-slate-100 dark:bg-slate-900 overflow-auto" style={{ minHeight: 600 }}>
          {drceLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading DRCE template…
            </div>
          )}
          {drceError && !drceLoading && (
            <div className="m-4 rounded border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300">
              {drceError}. The Emergency view above is always available.
            </div>
          )}
          {drceDoc && cls && stu && (() => {
            // Phase 3.1 — render-layer composition.
            //   1. base DRCEDocument loaded from the registry/dvcf
            //   2. snapshot branding bound via renderCtx.school (frozen)
            //   3. per-student data via snapshotToDRCEDataContext
            //   4. override layer applied last over (1) and propagated
            //      into (3) via __hiddenSubjectIds.
            const studentOverrides = selectOverridesForStudent(overrides, stu.studentDbId);
            const overriddenDoc    = applyOverrides(drceDoc, studentOverrides);
            const hiddenSubjectIds = readHiddenSubjectIds(overriddenDoc);
            const dataCtx = snapshotToDRCEDataContext(
              snapshot, classIdx, studentIdx,
              { schoolName: snapshot.meta.schoolName },
              hiddenSubjectIds,
            );
            // Phase 3.2 — Surface the override CRUD next to the live
            // preview. Sections come from the BASE document so a
            // hidden section can still be toggled back; subjects come
            // from the data context AFTER hiding so the panel reflects
            // what the renderer actually sees.
            const subjectOptions = cls.subjects.map(s => ({
              id:   s.id,
              name: s.displayName || s.name,
            }));
            return (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">
                <div className="flex justify-center">
                  <DRCEDocumentRenderer
                    document={overriddenDoc}
                    dataCtx={dataCtx}
                    renderCtx={{
                      school: snapshot.meta.branding
                        ? {
                            name:            snapshot.meta.branding.schoolName,
                            arabic_name:     snapshot.meta.branding.arabicName,
                            address:         snapshot.meta.branding.address,
                            contact:         snapshot.meta.branding.phone || snapshot.meta.branding.email,
                            center_no:       snapshot.meta.branding.centerNo,
                            registration_no: snapshot.meta.branding.registrationNumber,
                            logo_url:        snapshot.meta.branding.logoUrl,
                          }
                        : { name: snapshot.meta.schoolName },
                      isPrint: false,
                      language: snapshot.meta.language,
                      isRTL:    snapshot.meta.numerals === 'arabic',
                    }}
                  />
                </div>
                <div className="lg:sticky lg:top-4 self-start">
                  <OverridesPanel
                    snapshotId={snapshot.meta.snapshotId}
                    document={drceDoc}
                    overrides={overrides}
                    studentDbId={stu.studentDbId}
                    subjects={subjectOptions}
                    onChanged={() => { reloadOverrides().catch(() => undefined); }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: RegistryEntry['category'] }) {
  const map: Record<RegistryEntry['category'], { label: string; cls: string }> = {
    standard:   { label: 'Standard',   cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
    emergency:  { label: 'Emergency',  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    legacy_rpt: { label: 'Legacy rpt', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
    drce:       { label: 'DRCE',       cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
    arabic:     { label: 'Arabic',     cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    custom:     { label: 'Custom',     cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  };
  const v = map[category];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
