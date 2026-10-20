'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
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
import SnapshotAuditPanel from './SnapshotAuditPanel';
import { resolveActiveTemplateId } from '@/lib/snapshots/active-template';
import type { CellEditMeta } from '@/lib/drce/section-registry';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

export interface SnapshotPreviewerProps {
  snapshot: ReportSnapshot;
  /** Called after an inline edit is saved into the snapshot, so the host can re-read it. */
  onSnapshotChanged?: () => void;
}

type Mode = 'emergency' | 'drce';

const DEFAULT_EMERGENCY_BY_TYPE: Record<SnapshotType, string> = {
  secular:  'emergency-secular',
  theology: 'emergency-theology',
  mixed:    'emergency-secular',
};

/**
 * Last-resort DRCE built-in id for the snapshot type, used only when the
 * active/school-selected DRCE document cannot be resolved.
 *
 * The normal DRCE print path should prefer the explicit dropdown value,
 * then the active school document from /api/dvcf/active.
 */
const DEFAULT_DRCE_BY_TYPE: Record<SnapshotType, string> = {
  secular:  'drce-emergency-secular',
  theology: 'drce-emergency-theology',
  mixed:    'drce-emergency-secular',
};

/**
 * Class-paginated snapshot preview with two render modes:
 *   - 'emergency': iframe of the deterministic print route. Pixel-identical
 *     to print output. Always works, no DRCE dependency.
 *   - 'drce':       skinned React render via DRCEDocumentRenderer using the
 *     active dvcf_documents document. Switch templates without regenerating.
 */
export function SnapshotPreviewer({ snapshot, onSnapshotChanged }: SnapshotPreviewerProps) {
  const { t, digits } = useI18n();
  const [classIdx, setClassIdx]     = useState<number>(0);
  const [studentIdx, setStudentIdx] = useState<number>(0);
  const [mode, setMode]             = useState<Mode>('emergency');
  const [drceDoc, setDrceDoc]       = useState<DRCEDocument | null>(null);
  const [drceError, setDrceError]   = useState<string | null>(null);
  const [drceLoading, setDrceLoading] = useState<boolean>(false);
  const [activeDrceTemplateId, setActiveDrceTemplateId] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [showAudit, setShowAudit] = useState<boolean>(false);
  const [forcedPreviewSrc, setForcedPreviewSrc] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dvcf/active?type=report_card')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const id = json?.document?.meta?.id;
        setActiveDrceTemplateId(typeof id === 'string' ? id.trim() : '');
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

  // Inline DRCE edit → the snapshot PATCH (the same path the emergency print view saves through).
  // Initials sync across the class by subject; comments are per student, per subject row.
  const handleCellChange = async (_sectionId: string, _columnId: string, _rowIndex: number, newValue: string, meta?: CellEditMeta) => {
    if (!cls || !stu) return;
    const binding = meta?.binding ?? '';
    const subjectId = meta?.subjectId != null ? Number(meta.subjectId) : NaN;
    let action: Record<string, unknown> | null = null;
    if (binding === 'result.initials' && Number.isFinite(subjectId)) {
      action = { classIdx, studentDbId: null, field: 'initials', subjectId, value: newValue };
    } else if ((binding === 'result.comment' || binding === 'result.subjectComment') && Number.isFinite(subjectId)) {
      const idx = stu.results.findIndex(r => r.subjectId === subjectId);
      if (idx >= 0) action = { classIdx, studentDbId: stu.studentDbId, field: 'remarks', rowIndex: idx, value: newValue };
    }
    if (!action) { toast.error(t('academicsPages.snapshotView.notEditable', "This column can't be edited here — correct the marks in Results, then regenerate the snapshot.")); return; }
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(snapshot.meta.snapshotId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ actions: [action] }),
      });
      if (!res.ok) { toast.error(t('academicsPages.snapshotView.cellFailed', "Failed to update cell")); return; }
      toast.success(action.field === 'initials'
        ? t('academicsPages.snapshotView.initialsSynced', { count: cls.students.length })
        : t('academicsPages.snapshotView.cellUpdated', "Cell updated successfully"));
      onSnapshotChanged?.();
    } catch (error) {
      console.error('Error updating cell:', error);
      toast.error(t('academicsPages.snapshotView.cellFailed', "Failed to update cell"));
    }
  };

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
    () => registry.filter(t =>
      t.renderer === 'drce' &&
      t.supportedTypes.includes(snapshot.meta.type),
    ),
    [registry, snapshot.meta.type],
  );

  const selectedEmergency = useMemo(
    () => emergencyOptions.find(t => t.id === emergencyTemplateId) ?? null,
    [emergencyOptions, emergencyTemplateId],
  );

  const printBase = `/academics/report-cards/${snapshot.meta.type}/${snapshot.meta.snapshotId}/print`;
  const pdfBase   = `/academics/report-cards/${snapshot.meta.type}/${snapshot.meta.snapshotId}/pdf`;
  // PHASE 1C — DRCE templates render through the naked /print-snapshot
  // page so Next.js's standard SSR handles the `'use client'` boundary
  // correctly. The legacy /print route stays for emergency_html, which
  // is pure string substitution and works fine in a Route Handler.
  const drcePrintBase = `/print-snapshot/${snapshot.meta.type}/${snapshot.meta.snapshotId}`;
  const classes = snapshot.classes;
  const cls     = classes[classIdx];
  const stu     = cls?.students[studentIdx];

  /**
   * Single source of truth for the template id sent to the print/PDF
   * routes. PHASE 0 G1 fix — the previous "Print" link hard-coded the
   * emergency template id even when the user was in DRCE mode, which
   * is why DRCE templates appeared unprintable. We now pick the id
   * based on the active mode and fall back to a known DRCE built-in
   * when no specific template was picked.
   */
  const activeTemplateId = useMemo(() => {
    const resolved = resolveActiveTemplateId({
      mode,
      selectedDrceTemplateId: drceTemplateId || '',
      activeDrceTemplateId,
      fallbackTemplateId: mode === 'drce'
        ? DEFAULT_DRCE_BY_TYPE[snapshot.meta.type]
        : DEFAULT_EMERGENCY_BY_TYPE[snapshot.meta.type],
      availableTemplateIds: drceOptions.map(option => option.id),
    });

    return mode === 'drce' ? resolved : emergencyTemplateId || resolved;
  }, [mode, drceTemplateId, activeDrceTemplateId, emergencyTemplateId, snapshot.meta.type, drceOptions]);

  const shouldResolveDrceTemplateInPrintRoute =
    mode === 'drce' &&
    !drceTemplateId.trim() &&
    !activeDrceTemplateId.trim() &&
    drceOptions.length === 0;

  const previewSrc = useMemo(() => {
    if (forcedPreviewSrc) return forcedPreviewSrc;
    if (!cls) return mode === 'drce' ? drcePrintBase : printBase;
    const base = mode === 'drce' ? drcePrintBase : printBase;
    const editQuery = isEditMode ? '&edit=1' : '';
    let url = `${base}?class_id=${classIdx}&template=${encodeURIComponent(activeTemplateId)}${editQuery}`;
    if (mode === 'emergency' && !isEditMode) {
      url = `${base}?class_id=${classIdx}&template=${encodeURIComponent(activeTemplateId)}`;
    }
    return url;
  }, [printBase, drcePrintBase, classIdx, cls, activeTemplateId, mode, isEditMode]);

  // Print: DRCE goes to the naked page, emergency stays on the legacy
  // route. PDF always goes through /pdf (which internally puppeteers
  // the naked page for DRCE).
  const editQuery = isEditMode ? '&edit=1' : '';
  const routeTemplateQuery = shouldResolveDrceTemplateInPrintRoute
    ? ''
    : `&template=${encodeURIComponent(activeTemplateId)}`;
  const printHref = mode === 'drce'
    ? `${drcePrintBase}?class_id=${classIdx}${routeTemplateQuery}${editQuery}`
    : `${printBase}?class_id=${classIdx}${routeTemplateQuery}${editQuery}`;
  const pdfHref   = `${pdfBase}?class_id=${classIdx}${routeTemplateQuery}${editQuery}`;
  const [pdfBusy, setPdfBusy] = useState(false);
  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const res = await fetch(pdfHref, { credentials: 'same-origin' });
      if (!res.ok) {
        // The server now returns a structured { error, message, hint? }
        // JSON body on failure. Try to parse it so the toast shows
        // something actionable rather than the generic statusText.
        let detail = res.statusText || `HTTP ${res.status}`;
        const ct = res.headers.get('content-type') || '';
        try {
          if (ct.includes('application/json')) {
            const j = await res.json();
            detail = j.message || j.error || detail;
            if (j.hint) detail += ` — ${j.hint}`;
          } else {
            const txt = await res.text();
            if (txt) detail = txt.slice(0, 300);
          }
        } catch { /* fall through with statusText */ }
        toast.error(t('academicsPages.snapshotView.pdfFailed', { status: res.status, detail: uiIsArabic() && isEnglishText(detail) ? '—' : detail }), { duration: 8000 });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${snapshot.meta.schoolName} — ${cls?.className ?? 'class'} — ${snapshot.meta.termName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      // Network-level failure (dev server crashed, lost connection).
      // This is the "site can't be reached" case in toast form.
      toast.error(t('academicsPages.snapshotView.pdfNetwork', "Network error while building the PDF. Check your connection and try again."), { duration: 8000 });
    } finally {
      setPdfBusy(false);
    }
  }

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
        else setDrceError(t('academicsPages.snapshotView.noDrce', "No active DRCE template configured"));
        setDrceLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setDrceError(t('academicsPages.snapshotView.drceLoadFailed', "Failed to load DRCE template"));
        setDrceLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, drceTemplateId]);

  if (classes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
        {t('academicsPages.snapshotView.noClasses', "This snapshot contains no classes.")}
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
            aria-label={t('academicsPages.snapshotView.prevClass', "Previous class")}
            title={t('academicsPages.snapshotView.prevClass', "Previous class")}
          >
            <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
          </button>
          <select
            value={classIdx}
            onChange={e => setClassIdx(Number(e.target.value))}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
          >
            {classes.map((c, i) => (
              <option key={c.classId} value={i}>
                {t('academicsPages.snapshotView.classOpt', { name: c.className, count: c.students.length })}
              </option>
            ))}
          </select>
          <button
            onClick={() => setClassIdx(i => Math.min(classes.length - 1, i + 1))}
            disabled={classIdx === classes.length - 1}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
            aria-label={t('academicsPages.snapshotView.nextClass', "Next class")}
            title={t('academicsPages.snapshotView.nextClass', "Next class")}
          >
            <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
          </button>

          {mode === 'drce' && cls && (
            <select
              value={studentIdx}
              onChange={e => setStudentIdx(Number(e.target.value))}
              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
            >
              {cls.students.map((s, i) => (
                <option key={s.studentDbId} value={i}>
                  {digits(`#${s.position}`)} · {s.name}
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
              title={t('academicsPages.snapshotView.pickTemplate', "Pick a template")}
            >
              {(['emergency','arabic','legacy_rpt'] as const).map(cat => {
                const opts = emergencyOptions.filter(t => t.category === cat);
                if (opts.length === 0) return null;
                return (
                  <optgroup
                    key={cat}
                    label={
                      cat === 'emergency'  ? t('academicsPages.snapshotView.cat.emergency', "Emergency") :
                      cat === 'arabic'     ? t('academicsPages.snapshotView.cat.arabic', "Arabic / RTL") :
                                             t('academicsPages.snapshotView.cat.legacy', "Legacy rpt.html")
                    }
                  >
                    {opts.map(tpl => (
                      <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
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
              title={t('academicsPages.snapshotView.pickDrce', "Pick a DRCE template")}
            >
              <option value="">{t('academicsPages.snapshotView.schoolDefault', "— school default —")}</option>
              {drceOptions.map(tpl => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}{tpl.isDefault ? t('academicsPages.snapshotView.defaultTag', " (default)") : ''}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden text-xs">
            <button
              onClick={() => setMode('emergency')}
              className={`px-2.5 py-1 ${mode === 'emergency' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              {t('academicsPages.snapshotView.modeEmergency', "Emergency")}
            </button>
            <button
              onClick={() => setMode('drce')}
              disabled={drceOptions.length === 0}
              className={`px-2.5 py-1 inline-flex items-center gap-1 ${mode === 'drce' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={drceOptions.length === 0 ? t('academicsPages.snapshotView.noDrceTitle', "No DRCE template configured") : t('academicsPages.snapshotView.drceTitle', "DRCE renderer")}
            >
              <Layers className="w-3.5 h-3.5" /> DRCE
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              // Load the print view into the in-page iframe instead of opening a new tab
              setForcedPreviewSrc(printHref);
              setMode('emergency');
              // ensure we show the iframe immediately
              setIsEditMode(false);
              // small delay to allow iframe to mount
              setTimeout(() => {
                const el = document.querySelector('iframe[title^="Snapshot preview"]') as HTMLIFrameElement | null;
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 120);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
            title={mode === 'drce' ? t('academicsPages.snapshotView.printDrceTitle', "Open printable DRCE view in this panel") : t('academicsPages.snapshotView.printEmTitle', "Open printable emergency view in this panel")}
          >
            <Printer className="w-4 h-4" /> {t('academicsPages.snapshotView.print', "Print")}
          </button>
          <button
            type="button"
            onClick={() => setShowAudit(s => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-yellow-600 text-white hover:bg-yellow-700"
            title={t('academicsPages.snapshotView.auditTitle', "Show generation audit metadata")}
            aria-pressed={showAudit}
          >
            {t('academicsPages.snapshotView.audit', "Audit")}
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            title={t('academicsPages.snapshotView.pdfTitle', "Download a PDF rendered server-side (preserves multi-page DRCE layout).")}
          >
            {pdfBusy
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Printer className="w-4 h-4" />}
            {pdfBusy ? t('academicsPages.snapshotView.buildingPdf', "Building PDF…") : t('academicsPages.snapshotView.pdf', "PDF")}
          </button>
          {(mode === 'drce' || mode === 'emergency') && (
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm ${
                isEditMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
              title={isEditMode ? t('academicsPages.snapshotView.exitEdit', "Exit edit mode") : t('academicsPages.snapshotView.enterEdit', "Enter edit mode to modify report content")}
            >
              {isEditMode ? t('academicsPages.snapshotView.editing', "✏️ Editing") : t('academicsPages.snapshotView.edit', "✏️ Edit")}
            </button>
          )}
        </div>
      </div>

      {showAudit && <SnapshotAuditPanel key={classIdx} snapshot={snapshot} classIdx={classIdx} />}

      {(mode === 'drce' || mode === 'emergency') && (
        <div className="px-4 pb-4 text-xs text-slate-600 dark:text-slate-400">
          {isEditMode ? t('academicsPages.snapshotView.editOn', "Edit mode is on. Click any result cell — subject comments, initials, scores or grades — to type a correction in place; it saves back to this snapshot on blur. Initials/teacher columns sync across the whole class.") : t('academicsPages.snapshotView.editOff', "Inline editing is available in both DRCE and emergency preview modes. Click Edit, then click any result cell to change it in place.")}
        </div>
      )}

      {mode === 'emergency' && (
        <iframe
          key={previewSrc}
          src={previewSrc}
          title={t('academicsPages.snapshotView.previewTitle', { name: cls?.className ?? '' })}
          className="w-full"
          style={{ height: '80vh', minHeight: 600, border: 0 }}
        />
      )}

      {mode === 'drce' && (
        <div className="bg-slate-100 dark:bg-slate-900 overflow-auto" style={{ minHeight: 600 }}>
          {drceLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('academicsPages.snapshotView.loadingDrce', "Loading DRCE template…")}
            </div>
          )}
          {drceError && !drceLoading && (
            <div className="m-4 rounded border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300">
              {t('academicsPages.snapshotView.emergencyAvailable', { err: drceError })}
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
                    onCellChange={isEditMode ? handleCellChange : undefined}
                    onColumnHide={undefined}
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
  const { t } = useI18n();
  const map: Record<RegistryEntry['category'], { label: string; cls: string }> = {
    standard:   { label: t('academicsPages.snapshotView.badge.standard', "Standard"),   cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
    emergency:  { label: t('academicsPages.snapshotView.badge.emergency', "Emergency"),  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    legacy_rpt: { label: t('academicsPages.snapshotView.badge.legacy_rpt', "Legacy rpt"), cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
    drce:       { label: t('academicsPages.snapshotView.badge.drce', "DRCE"),       cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
    arabic:     { label: t('academicsPages.snapshotView.badge.arabic', "Arabic"),     cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    custom:     { label: t('academicsPages.snapshotView.badge.custom', "Custom"),     cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  };
  const v = map[category] ?? map.custom;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
