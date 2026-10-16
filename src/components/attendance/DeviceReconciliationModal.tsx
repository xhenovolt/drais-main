"use client";

/**
 * Phase 3G — Device Reconciliation Center.
 *
 * The biometric operations center for a single device. Replaces vague
 * "data mismatch" with specific categories and concrete actions. Tabs:
 *   Overview · People on Device · Missing from Device · Mismatches ·
 *   Orphan Templates · Activity (commands + audit)
 *
 * All identity actions route through the Phase 3 device APIs, which in
 * turn write canonical biometric_enrollments via the enrollment service
 * (safety rules enforced server-side). Name-only mapping is never
 * automatic — the operator always confirms.
 */
import React, { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import {
  X, RefreshCw, Loader, Users, UserMinus, AlertTriangle, Fingerprint,
  ClipboardList, Search, UserPlus, Check, Ban, ShieldAlert, Send,
  Server, Wifi, WifiOff, ArrowRight, History as HistoryIcon, Repeat, Trash2,
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import { useI18n } from '@/components/i18n/I18nProvider';

type TFn = (k: string, v?: any) => string;
/** Reconciliation notes are fixed English sentences from the server (reconciliation-service); shown in the interface language. */
function noteText(t: TFn, note: string | undefined | null): string {
  const s = String(note ?? '');
  let m = /^Enrollment suspended \((.+)\) — not recognised$/.exec(s);
  if (m) return t('devicesPages.recon.note.suspended', { reason: m[1] === 'inactive' ? t('devicesPages.recon.note.inactive') : m[1] });
  m = /^Mapped to an archived (student|staff) — unmap or reassign, and remove from device$/.exec(s);
  if (m) return t('devicesPages.recon.note.archived', { role: t(`devicesPages.recon.role.${m[1]}`) });
  m = /^Not echoed by device in (\d+)\+ days$/.exec(s);
  if (m) return t('devicesPages.recon.note.stale', { n: m[1] });
  const exact: Record<string, string> = {
    'DRAIS holds a template; device has not confirmed this PIN': 'note.templateUnconfirmed',
    'Enrolled in DRAIS, not seen on device': 'note.notSeen',
    'Fingerprint template on device with no DRAIS identity': 'note.orphan',
    'Quarantined': 'note.quarantined',
  };
  return exact[s] ? t(`devicesPages.recon.${exact[s]}`) : s;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ── Mismatch presentation ───────────────────────────────────────────
const MISMATCH_LABEL: Record<string, string> = {
  MAPPED_OK: 'Mapped',
  DEVICE_ONLY_USER: 'On device, not in DRAIS',
  DEVICE_ONLY_TEMPLATE: 'Fingerprint on device, no DRAIS identity',
  DRAIS_ONLY_PERSON: 'In DRAIS, not on device',
  DRAIS_TEMPLATE_NOT_ON_DEVICE: 'Template in DRAIS, not confirmed on device',
  NAME_DRIFT: 'Name differs from DRAIS',
  PIN_CONFLICT: 'PIN conflict',
  ROLE_CONFLICT: 'Role conflict',
  STAFF_STUDENT_AMBIGUOUS: 'Matches learner AND staff',
  ORPHAN_TEMPLATE: 'Orphan fingerprint',
  STALE_MAPPING: 'Stale — not echoed recently',
  DELETED_PERSON_MAPPING: 'Mapped to a deleted person',
  INACTIVE_MAPPING: 'Inactive mapping',
  IGNORED_OR_QUARANTINED: 'Ignored / quarantined',
};
const MISMATCH_COLOR: Record<string, string> = {
  MAPPED_OK: 'bg-emerald-100 text-emerald-700',
  DEVICE_ONLY_USER: 'bg-amber-100 text-amber-800',
  DEVICE_ONLY_TEMPLATE: 'bg-orange-100 text-orange-800',
  DRAIS_ONLY_PERSON: 'bg-sky-100 text-sky-700',
  DRAIS_TEMPLATE_NOT_ON_DEVICE: 'bg-indigo-100 text-indigo-700',
  NAME_DRIFT: 'bg-yellow-100 text-yellow-800',
  PIN_CONFLICT: 'bg-red-100 text-red-700',
  ROLE_CONFLICT: 'bg-red-100 text-red-700',
  STAFF_STUDENT_AMBIGUOUS: 'bg-purple-100 text-purple-800',
  ORPHAN_TEMPLATE: 'bg-orange-100 text-orange-800',
  STALE_MAPPING: 'bg-slate-200 text-slate-600',
  DELETED_PERSON_MAPPING: 'bg-red-100 text-red-700',
  INACTIVE_MAPPING: 'bg-slate-200 text-slate-600',
  IGNORED_OR_QUARANTINED: 'bg-gray-200 text-gray-500',
};

interface ReconItem {
  devicePin: string | null;
  deviceName: string | null;
  matchedPersonId: number | null;
  matchedRoleType: 'student' | 'staff' | null;
  matchedRoleRefId: number | null;
  canonicalEnrollmentId: number | null;
  mismatchType: string;
  confidence: number | null;
  candidates: Array<{ type: string; id: number; name: string; score: number }> | null;
  lastSeenOnDeviceAt: string | null;
  hasFingerprintEvidence: boolean;
  notes?: string;
}

type TabKey = 'overview' | 'people' | 'missing' | 'mismatches' | 'orphans' | 'activity';

const DEVICE_SIDE = new Set([
  'DEVICE_ONLY_USER', 'DEVICE_ONLY_TEMPLATE', 'NAME_DRIFT', 'STAFF_STUDENT_AMBIGUOUS',
  'PIN_CONFLICT', 'ROLE_CONFLICT', 'MAPPED_OK', 'IGNORED_OR_QUARANTINED',
  'DELETED_PERSON_MAPPING', 'INACTIVE_MAPPING',
]);
const MISSING_SIDE = new Set(['DRAIS_ONLY_PERSON', 'STALE_MAPPING', 'DRAIS_TEMPLATE_NOT_ON_DEVICE']);
const ORPHAN_SIDE = new Set(['ORPHAN_TEMPLATE', 'DEVICE_ONLY_TEMPLATE']);

function MismatchBadge({ type }: { type: string }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${MISMATCH_COLOR[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {MISMATCH_LABEL[type] ? t(`devicesPages.recon.mm.${type}`) : type}
    </span>
  );
}

function fmt(iso: string | null, lang = 'en') {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(lang === 'ar' ? 'ar-u-nu-arab-ca-gregory' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DeviceReconciliationModal({
  sn, deviceName, onClose,
}: {
  sn: string;
  deviceName?: string | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<TabKey>('overview');
  const [running, setRunning] = useState(false);
  const [actionPin, setActionPin] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/devices/${encodeURIComponent(sn)}/reconciliation`, fetcher,
    { refreshInterval: 0 },
  );
  const { data: activity, mutate: mutateActivity } = useSWR<any>(
    tab === 'activity' ? `/api/attendance/devices/${encodeURIComponent(sn)}/activity` : null, fetcher,
  );

  const report = data?.report;
  const items: ReconItem[] = report?.items ?? [];
  const counts: Record<string, number> = report?.counts ?? {};

  const peopleRows = useMemo(() => items.filter(i => DEVICE_SIDE.has(i.mismatchType)), [items]);
  const missingRows = useMemo(() => items.filter(i => MISSING_SIDE.has(i.mismatchType)), [items]);
  const mismatchRows = useMemo(() => items.filter(i => i.mismatchType !== 'MAPPED_OK'), [items]);
  const orphanRows = useMemo(() => items.filter(i => ORPHAN_SIDE.has(i.mismatchType)), [items]);

  const runReconciliation = useCallback(async () => {
    setRunning(true);
    try {
      await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/reconciliation`, {
        method: 'POST', successMessage: t('devicesPages.recon.runRecorded'),
      });
      await mutate();
    } catch { /* toast shown */ } finally { setRunning(false); }
  }, [sn, mutate]);

  const [provisioning, setProvisioning] = useState(false);
  const provisionStaff = useCallback(async () => {
    setProvisioning(true);
    try {
      // 1. Dry-run preview.
      const preview = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/provision-staff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }), silent: true,
      });
      const ps = preview?.summary;
      const previewText = lang === 'ar' && ps && Array.isArray(preview?.plan)
        ? t('devicesPages.recon.provisionPreview', { convert: preview.plan.filter((p: any) => String(p.action).startsWith('reassign') || String(p.action).startsWith('create')).length, blank: ps.skippedBlank ?? 0, already: ps.alreadyStaff ?? 0, students: ps.unmappedRemainingStudents ?? 0 })
        : (lang === 'ar' ? t('devicesPages.recon.previewReady') : (preview?.message || 'Preview ready.'));
      if (!window.confirm(`${previewText}\n\n${t('devicesPages.recon.provisionConfirm')}`)) { setProvisioning(false); return; }
      // 2. Execute.
      const res = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/provision-staff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      });
      const rs = res?.summary;
      showToast('success', lang === 'ar'
        ? (rs ? t('devicesPages.recon.provisionDone', { now: (rs.converted ?? 0) + (rs.mappedFresh ?? 0), created: rs.createdStaff ?? 0, students: rs.unmappedRemainingStudents ?? 0, blank: rs.skippedBlank ?? 0 }) : t('devicesPages.recon.provisioned'))
        : (res?.message || 'Provisioned device users as staff'));
      await mutate();
    } catch { /* apiFetch shows the error (e.g. empty directory → Sync first) */ } finally {
      setProvisioning(false);
    }
  }, [sn, mutate, t, lang]);

  const syncDirectory = useCallback(async () => {
    // Pull the device's CURRENT user list. Prefer a LAN TCP pull
    // (remembered IP); blank → over-the-air ADMS sync.
    const key = `drais.lanip.${sn}`;
    let lanIp = typeof window !== 'undefined' ? window.localStorage.getItem(key) || '' : '';
    if (!lanIp) {
      lanIp = window.prompt(
        t('devicesPages.recon.promptLan'),
        '192.168.1.',
      ) ?? '';
      if (lanIp === null as any) return;
      if (lanIp) window.localStorage.setItem(key, lanIp);
    }
    try {
      const r = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/inventory`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lanIp ? { device_ip: lanIp } : { method: 'adms' }),
      });
      showToast(r?.method === 'adms' ? 'info' : 'success', lang === 'ar' ? t(r?.method === 'adms' ? 'devicesPages.recon.inventoryQueued' : 'devicesPages.recon.inventoryDone') : (r?.message ?? 'Inventory sync done'));
      await mutate();
    } catch {
      if (lanIp && typeof window !== 'undefined') window.localStorage.removeItem(key);
    }
  }, [sn, mutate, t, lang]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('devicesPages.recon.title', { name: deviceName || t('devicesPages.recon.device') })}</h2>
              <p className="text-xs font-mono text-gray-400">{sn}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={syncDirectory} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200">
              <RefreshCw className="w-3.5 h-3.5" /> {t('devicesPages.recon.syncDirectory')}
            </button>
            <button onClick={provisionStaff} disabled={provisioning} title={t('devicesPages.recon.convertTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 text-amber-800 dark:text-amber-200 disabled:opacity-50">
              {provisioning ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />} {t('devicesPages.recon.convert')}
            </button>
            <button onClick={runReconciliation} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {running ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />} {t('devicesPages.recon.runRecon')}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Partial-directory honesty banner */}
        {report?.directoryIsPartial && (
          <div className="px-5 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {t('devicesPages.recon.partial')}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-2 border-b border-gray-100 dark:border-slate-800 overflow-x-auto">
          {([
            ['overview', t('devicesPages.recon.tab.overview'), Server],
            ['people', t('devicesPages.recon.tab.people', { n: peopleRows.length }), Users],
            ['missing', t('devicesPages.recon.tab.missing', { n: missingRows.length }), UserMinus],
            ['mismatches', t('devicesPages.recon.tab.mismatches', { n: mismatchRows.length }), AlertTriangle],
            ['orphans', t('devicesPages.recon.tab.orphans', { n: orphanRows.length }), Fingerprint],
            ['activity', t('devicesPages.recon.tab.activity'), ClipboardList],
          ] as [TabKey, string, any][]).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap ${tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400"><Loader className="w-5 h-5 animate-spin me-2" /> {t('devicesPages.recon.loading')}</div>
          ) : !report ? (
            <div className="text-sm text-gray-400">{t('devicesPages.recon.noData')}</div>
          ) : (
            <>
              {tab === 'overview' && <OverviewTab report={report} counts={counts} />}
              {tab === 'people' && <PeopleTab sn={sn} rows={peopleRows} onChanged={mutate} setActionPin={setActionPin} actionPin={actionPin} />}
              {tab === 'missing' && <MissingTab sn={sn} rows={missingRows} onChanged={mutate} />}
              {tab === 'mismatches' && <MismatchesTab rows={mismatchRows} />}
              {tab === 'orphans' && <OrphansTab sn={sn} rows={orphanRows} onChanged={mutate} setActionPin={setActionPin} actionPin={actionPin} />}
              {tab === 'activity' && <ActivityTab activity={activity} onRefresh={mutateActivity} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────
function OverviewTab({ report, counts }: { report: any; counts: Record<string, number> }) {
  const { t, digits } = useI18n();
  const stat = (label: string, value: number | string, color = 'text-slate-800') => (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
      <div className={`text-2xl font-bold ${color}`}>{digits(value)}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat(t('devicesPages.recon.stat.echoed'), report.deviceUserCount)}
        {stat(t('devicesPages.recon.stat.enrollments'), report.draisExpectedCount)}
        {stat(t('devicesPages.recon.stat.mapped'), counts.MAPPED_OK ?? 0, 'text-emerald-600')}
        {stat(t('devicesPages.recon.stat.attention'), report.items.filter((i: any) => i.mismatchType !== 'MAPPED_OK').length, 'text-amber-600')}
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('devicesPages.recon.breakdown')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(counts).filter(([, n]) => n > 0).map(([type, n]) => (
            <div key={type} className="flex items-center justify-between bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg px-3 py-2">
              <MismatchBadge type={type} />
              <span className="text-sm font-bold">{digits(n)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── People on Device ─────────────────────────────────────────────────
function PeopleTab({ sn, rows, onChanged, setActionPin, actionPin }: {
  sn: string; rows: ReconItem[]; onChanged: () => void;
  setActionPin: (p: string | null) => void; actionPin: string | null;
}) {
  const { t, digits } = useI18n();
  const person = (r: ReconItem) => r.matchedRoleType ? t('devicesPages.recon.roleRef', { role: t(`devicesPages.recon.role.${r.matchedRoleType}`), id: r.matchedRoleRefId }) : null;
  const nameSuffix = (r: ReconItem) => r.deviceName ? ` (${r.deviceName})` : '';
  const [filter, setFilter] = useState<string>('all');
  // Local expansion for mapped-row edit/reassign/history (separate from
  // the unmapped Resolve panel driven by actionPin).
  const [editPin, setEditPin] = useState<{ pin: string; mode: 'reassign' | 'history' } | null>(null);
  const filtered = rows.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'mapped') return r.mismatchType === 'MAPPED_OK' || r.mismatchType === 'NAME_DRIFT';
    if (filter === 'unknown') return r.mismatchType === 'DEVICE_ONLY_USER' || r.mismatchType === 'DEVICE_ONLY_TEMPLATE';
    if (filter === 'ambiguous') return r.mismatchType === 'STAFF_STUDENT_AMBIGUOUS';
    if (filter === 'deleted') return r.mismatchType === 'DELETED_PERSON_MAPPING';
    if (filter === 'inactive') return r.mismatchType === 'INACTIVE_MAPPING';
    if (filter === 'ignored') return r.mismatchType === 'IGNORED_OR_QUARANTINED';
    return true;
  });
  if (rows.length === 0) return <Empty msg={t('devicesPages.recon.emptyPeople')} />;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {['all', 'mapped', 'unknown', 'ambiguous', 'deleted', 'inactive', 'ignored'].map(f => {
          const n = f === 'all' ? rows.length : rows.filter(r => {
            if (f === 'mapped') return r.mismatchType === 'MAPPED_OK' || r.mismatchType === 'NAME_DRIFT';
            if (f === 'unknown') return r.mismatchType === 'DEVICE_ONLY_USER' || r.mismatchType === 'DEVICE_ONLY_TEMPLATE';
            if (f === 'ambiguous') return r.mismatchType === 'STAFF_STUDENT_AMBIGUOUS';
            if (f === 'deleted') return r.mismatchType === 'DELETED_PERSON_MAPPING';
            if (f === 'inactive') return r.mismatchType === 'INACTIVE_MAPPING';
            if (f === 'ignored') return r.mismatchType === 'IGNORED_OR_QUARANTINED';
            return false;
          }).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-full ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'} ${f === 'deleted' && n > 0 && filter !== f ? 'ring-1 ring-red-300 text-red-600' : ''}`}>
              {t(`devicesPages.recon.filter.${f}`)}{f !== 'all' && n > 0 ? ` (${digits(n)})` : ''}
            </button>
          );
        })}
      </div>
      <table className="w-full text-sm">
        <thead className="text-start text-[11px] uppercase text-gray-400 border-b border-gray-100">
          <tr><th className="py-2 text-start">{t('devicesPages.recon.col.pin')}</th><th className="text-start">{t('devicesPages.recon.col.deviceName')}</th><th className="text-start">{t('devicesPages.recon.col.person')}</th><th className="text-start">{t('devicesPages.recon.col.status')}</th><th className="text-start">{t('devicesPages.recon.col.fingerprint')}</th><th className="text-start">{t('devicesPages.recon.col.actions')}</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
          {filtered.map(r => (
            <React.Fragment key={`${r.devicePin}:${r.mismatchType}`}>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 font-mono text-xs">{digits(r.devicePin)}</td>
                <td className="text-gray-700 dark:text-gray-200">{r.deviceName || <span className="text-gray-300">—</span>}</td>
                <td className="text-gray-500">{person(r) ?? <span className="text-gray-300">{t('devicesPages.recon.unmapped')}</span>}</td>
                <td><MismatchBadge type={r.mismatchType} /></td>
                <td>{r.hasFingerprintEvidence ? <Fingerprint className="w-4 h-4 text-emerald-500" /> : <span className="text-gray-300 text-xs">{t('devicesPages.recon.none')}</span>}</td>
                <td>
                  {r.mismatchType === 'MAPPED_OK' || r.mismatchType === 'NAME_DRIFT'
                    || r.mismatchType === 'DELETED_PERSON_MAPPING' || r.mismatchType === 'INACTIVE_MAPPING' ? (
                    <div className="flex gap-1">
                      <ActionBtn label={t('devicesPages.recon.btn.reassign')} icon={Repeat} primary
                        onClick={() => { setActionPin(null); setEditPin(editPin?.pin === r.devicePin && editPin.mode === 'reassign' ? null : { pin: r.devicePin!, mode: 'reassign' }); }} />
                      <ActionBtn label={t('devicesPages.recon.btn.unmap')} icon={UserMinus}
                        onClick={() => {
                          if (window.confirm(t('devicesPages.recon.confirmUnmap', { pin: r.devicePin, name: nameSuffix(r) }))) {
                            act(sn, r.devicePin!, { action: 'unmap' }, onChanged);
                          }
                        }} />
                      <ActionBtn label={t('devicesPages.recon.btn.history')} icon={HistoryIcon}
                        onClick={() => { setActionPin(null); setEditPin(editPin?.pin === r.devicePin && editPin.mode === 'history' ? null : { pin: r.devicePin!, mode: 'history' }); }} />
                      <ActionBtn label={t('devicesPages.recon.btn.removeFromDevice')} icon={Trash2}
                        onClick={() => {
                          if (window.confirm(t('devicesPages.recon.confirmRemoveMapped', { pin: r.devicePin, name: nameSuffix(r) }))) {
                            act(sn, r.devicePin!, { action: 'remove-from-device' }, onChanged);
                          }
                        }} />
                    </div>
                  ) : r.mismatchType === 'IGNORED_OR_QUARANTINED' ? (
                    <ActionBtn label={t('devicesPages.recon.btn.release')} icon={Check} onClick={() => act(sn, r.devicePin!, { action: 'release' }, onChanged)} />
                  ) : (
                    <div className="flex gap-1">
                      <ActionBtn label={t('devicesPages.recon.btn.resolve')} icon={UserPlus} primary onClick={() => { setEditPin(null); setActionPin(actionPin === r.devicePin ? null : r.devicePin); }} />
                      <ActionBtn label={t('devicesPages.recon.btn.ignore')} icon={Ban} onClick={() => act(sn, r.devicePin!, { action: 'ignore' }, onChanged)} />
                      <ActionBtn label={t('devicesPages.recon.btn.quarantine')} icon={ShieldAlert} onClick={() => act(sn, r.devicePin!, { action: 'quarantine' }, onChanged)} />
                      <ActionBtn label={t('devicesPages.recon.btn.removeFromDevice')} icon={Trash2}
                        onClick={() => {
                          if (window.confirm(t('devicesPages.recon.confirmRemove', { pin: r.devicePin, name: nameSuffix(r) }))) {
                            act(sn, r.devicePin!, { action: 'remove-from-device' }, onChanged);
                          }
                        }} />
                    </div>
                  )}
                </td>
              </tr>
              {actionPin === r.devicePin && (
                <tr><td colSpan={6} className="bg-slate-50 dark:bg-slate-800/60 p-3">
                  <ResolvePanel sn={sn} item={r} onDone={() => { setActionPin(null); onChanged(); }} />
                </td></tr>
              )}
              {editPin?.pin === r.devicePin && editPin.mode === 'reassign' && (
                <tr><td colSpan={6} className="bg-amber-50/60 dark:bg-amber-900/10 p-3">
                  <ReassignPanel sn={sn} item={r} onDone={() => { setEditPin(null); onChanged(); }} />
                </td></tr>
              )}
              {editPin?.pin === r.devicePin && editPin.mode === 'history' && (
                <tr><td colSpan={6} className="bg-slate-50 dark:bg-slate-800/60 p-3">
                  <HistoryPanel sn={sn} pin={r.devicePin!} />
                </td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Resolve panel: map to existing / create learner / create staff ──
function ResolvePanel({ sn, item, onDone }: { sn: string; item: ReconItem; onDone: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'map' | 'create-student' | 'create-staff'>('map');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>(() => {
    const parts = (item.deviceName || '').trim().split(/\s+/);
    return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '', class_id: '', stream_id: '', admission_no: '' };
  });

  const { data: studentSearch } = useSWR<any>(mode === 'map' && q.length > 1 ? `/api/students/search?q=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const { data: staffSearch } = useSWR<any>(mode === 'map' && q.length > 1 ? `/api/staff?search=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const { data: classes } = useSWR<any>(mode === 'create-student' ? '/api/classes' : null, fetcher);

  const submit = async (body: any) => {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(item.devicePin!)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), successMessage: t('devicesPages.recon.resolved'),
      });
      onDone();
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const students = studentSearch?.students ?? studentSearch?.data ?? [];
  const staff = staffSearch?.data ?? staffSearch?.staff ?? [];
  const classList = classes?.data ?? classes?.classes ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {([['map', t('devicesPages.recon.mode.map')], ['create-student', t('devicesPages.recon.mode.createStudent')], ['create-staff', t('devicesPages.recon.mode.createStaff')]] as const).map(([m, l]) => (
          <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 text-xs rounded ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 border'}`}>{l}</button>
        ))}
      </div>

      {item.candidates && item.candidates.length > 0 && mode === 'map' && (
        <div className="text-xs text-purple-600 dark:text-purple-300">
          {t('devicesPages.recon.suggested', { list: item.candidates.map(c => `${c.name} [${t(`devicesPages.recon.role.${c.type}`, c.type)}]`).join(' · ') })}
        </div>
      )}

      {mode === 'map' && (
        <div>
          <div className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700">
            <Search className="w-4 h-4 text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('devicesPages.recon.searchPh')} className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="max-h-44 overflow-y-auto mt-2 space-y-1">
            {students.map((s: any) => (
              <button key={`st${s.id}`} disabled={busy} onClick={() => submit({ action: 'map', user_type: 'student', student_id: s.id || s.student_id })}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-indigo-50 dark:hover:bg-slate-600">
                <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
                <span className="text-[11px] text-gray-400">{t('devicesPages.recon.learnerRef', { id: s.admission_no || s.id })}</span>
              </button>
            ))}
            {staff.map((s: any) => (
              <button key={`sf${s.id}`} disabled={busy} onClick={() => submit({ action: 'map', user_type: 'staff', staff_id: s.id || s.staff_id })}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-indigo-50 dark:hover:bg-slate-600">
                <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
                <span className="text-[11px] text-gray-400">{t('devicesPages.recon.staffRef', { id: s.id })}</span>
              </button>
            ))}
            {q.length > 1 && students.length === 0 && staff.length === 0 && <div className="text-xs text-gray-400 px-3">{t('devicesPages.recon.noMatches')}</div>}
          </div>
        </div>
      )}

      {mode === 'create-student' && (
        <div className="grid grid-cols-2 gap-2">
          <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder={t('devicesPages.recon.firstName')} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder={t('devicesPages.recon.lastName')} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.admission_no} onChange={e => setForm({ ...form, admission_no: e.target.value })} placeholder={t('devicesPages.recon.admissionNo')} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <select value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700">
            <option value="">{t('devicesPages.recon.selectClass')}</option>
            {classList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={busy || !form.first_name || !form.last_name || !form.class_id}
            onClick={() => submit({ action: 'create-student', ...form })}
            className="col-span-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">
            {busy ? t('devicesPages.recon.creating') : t('devicesPages.recon.createLearner')}
          </button>
          <p className="col-span-2 text-[11px] text-gray-400">{t('devicesPages.recon.classRequired', { pin: item.devicePin })}</p>
        </div>
      )}

      {mode === 'create-staff' && (
        <div className="grid grid-cols-2 gap-2">
          <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder={t('devicesPages.recon.firstName')} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder={t('devicesPages.recon.lastName')} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.designation || ''} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder={t('devicesPages.recon.designation')} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder={t('devicesPages.recon.phone')} className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
          <button disabled={busy || !form.first_name || !form.last_name}
            onClick={() => submit({ action: 'create-staff', ...form })}
            className="col-span-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">
            {busy ? t('devicesPages.recon.creating') : t('devicesPages.recon.createStaff')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Reassign panel: move a mapped PIN to a different person ──────────
function ReassignPanel({ sn, item, onDone }: { sn: string; item: ReconItem; onDone: () => void }) {
  const { t, rich } = useI18n();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const { data: studentSearch } = useSWR<any>(q.length > 1 ? `/api/students/search?q=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const { data: staffSearch } = useSWR<any>(q.length > 1 ? `/api/staff?search=${encodeURIComponent(q)}&limit=10` : null, fetcher);
  const students = studentSearch?.students ?? studentSearch?.data ?? [];
  const staff = staffSearch?.data ?? staffSearch?.staff ?? [];

  const submit = async (user_type: 'student' | 'staff', id: number, name: string) => {
    if (!window.confirm(t('devicesPages.recon.confirmReassign', { pin: item.devicePin, name }))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(item.devicePin!)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reassign', user_type, student_id: user_type === 'student' ? id : undefined, staff_id: user_type === 'staff' ? id : undefined, reason: reason || undefined }),
      });
      onDone();
    } catch { /* toast shown */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-900/20 rounded p-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          {rich('devicesPages.recon.reassigning', { pin: <span className="font-mono">{t('devicesPages.recon.pinRef', { pin: item.devicePin })}</span> }, { current: item.matchedRoleType ? t('devicesPages.recon.currently', { role: t(`devicesPages.recon.role.${item.matchedRoleType}`), id: item.matchedRoleRefId }) : '' })}
        </div>
      </div>
      <div className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700">
        <Search className="w-4 h-4 text-gray-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('devicesPages.recon.searchNewPh')} className="flex-1 text-sm bg-transparent outline-none" />
      </div>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder={t('devicesPages.recon.reasonPh')} className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700" />
      <div className="max-h-44 overflow-y-auto space-y-1">
        {students.map((s: any) => (
          <button key={`st${s.id}`} disabled={busy} onClick={() => submit('student', s.id || s.student_id, [s.first_name, s.last_name].filter(Boolean).join(' '))}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-amber-50 dark:hover:bg-slate-600">
            <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
            <span className="text-[11px] text-gray-400">{t('devicesPages.recon.learnerRef', { id: s.admission_no || s.id })}</span>
          </button>
        ))}
        {staff.map((s: any) => (
          <button key={`sf${s.id}`} disabled={busy} onClick={() => submit('staff', s.id || s.staff_id, [s.first_name, s.last_name].filter(Boolean).join(' '))}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded hover:bg-amber-50 dark:hover:bg-slate-600">
            <span>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</span>
            <span className="text-[11px] text-gray-400">{t('devicesPages.recon.staffRef', { id: s.id })}</span>
          </button>
        ))}
        {q.length > 1 && students.length === 0 && staff.length === 0 && <div className="text-xs text-gray-400 px-3">{t('devicesPages.recon.noMatches')}</div>}
      </div>
    </div>
  );
}

// ── History panel: mapping change audit for a PIN ────────────────────
const HISTORY_LABEL: Record<string, string> = {
  map: 'Mapped', reassign: 'Reassigned', unmap: 'Unmapped', revoke: 'Revoked',
  suspend_person_archived: 'Suspended (person archived)', reactivate: 'Reactivated', edit: 'Edited',
};
function HistoryPanel({ sn, pin }: { sn: string; pin: string }) {
  const { t, lang, digits } = useI18n();
  const { data, isLoading } = useSWR<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(pin)}`, fetcher);
  const history: any[] = data?.history ?? [];
  if (isLoading) return <div className="text-xs text-gray-400 flex items-center gap-2"><Loader className="w-3.5 h-3.5 animate-spin" /> {t('devicesPages.recon.loadingHistory')}</div>;
  if (history.length === 0) return <div className="text-xs text-gray-400">{t('devicesPages.recon.noHistory', { pin })}</div>;
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase text-gray-400 mb-1">{t('devicesPages.recon.historyTitle', { pin })}</div>
      {history.map((h) => (
        <div key={h.id} className="flex items-center gap-2 text-xs bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
          <span className="font-semibold text-indigo-600 whitespace-nowrap">{HISTORY_LABEL[h.action] ? t(`devicesPages.recon.hist.${h.action}`) : h.action}</span>
          <span className="text-gray-600 dark:text-gray-300 truncate">
            {h.old_person_name ? h.old_person_name : (h.old_role_type ? t('devicesPages.recon.roleRef', { role: t(`devicesPages.recon.role.${h.old_role_type}`, h.old_role_type), id: h.old_role_ref_id }) : '')}
            {h.new_person_name || h.new_role_type ? <> {lang === 'ar' ? '←' : '→'} {h.new_person_name || t('devicesPages.recon.roleRef', { role: t(`devicesPages.recon.role.${h.new_role_type}`, h.new_role_type), id: h.new_role_ref_id })}</> : null}
          </span>
          {h.reason && <span className="text-gray-400 italic truncate">“{h.reason}”</span>}
          <span className="text-gray-400 ms-auto whitespace-nowrap">{h.actor_name || '—'} · {fmt(h.created_at, lang)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Missing from Device ──────────────────────────────────────────────
function MissingTab({ sn, rows, onChanged }: { sn: string; rows: ReconItem[]; onChanged: () => void }) {
  const { t, lang, digits } = useI18n();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const pushable = rows.filter(r => r.canonicalEnrollmentId);
  if (rows.length === 0) return <Empty msg={t('devicesPages.recon.emptyMissing')} />;

  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pushSelected = async (preview: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) { showToast('warning', t('devicesPages.recon.selectOne')); return; }
    setBusy(true);
    try {
      const r = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/push-missing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_ids: ids, preview }),
      });
      if (preview) showToast('info', t('devicesPages.recon.willQueue', { queue: r.will_queue, skip: r.skipped }));
      else { showToast('success', lang === 'ar' ? t('devicesPages.recon.queued', { count: r.queued ?? 0 }) : r.message); setSelected(new Set()); onChanged(); }
    } catch { /* toast */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => pushSelected(true)} disabled={busy || selected.size === 0} className="px-3 py-1.5 text-xs rounded bg-slate-100 dark:bg-slate-800 disabled:opacity-50">{t('devicesPages.recon.previewPush', { n: selected.size })}</button>
        <button onClick={() => pushSelected(false)} disabled={busy || selected.size === 0} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-indigo-600 text-white disabled:opacity-50"><Send className="w-3.5 h-3.5" /> {t('devicesPages.recon.pushSelected')}</button>
        <button onClick={() => setSelected(new Set(pushable.map(r => r.canonicalEnrollmentId!)))} className="px-2 py-1 text-xs text-indigo-600">{t('devicesPages.recon.selectAll')}</button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-start text-[11px] uppercase text-gray-400 border-b border-gray-100">
          <tr><th className="py-2 w-8"></th><th className="text-start">{t('devicesPages.recon.mcol.name')}</th><th className="text-start">{t('devicesPages.recon.mcol.role')}</th><th className="text-start">{t('devicesPages.recon.col.pin')}</th><th className="text-start">{t('devicesPages.recon.col.status')}</th><th className="text-start">{t('devicesPages.recon.mcol.template')}</th><th className="text-start">{t('devicesPages.recon.mcol.lastSeen')}</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
          {rows.map(r => (
            <tr key={`${r.devicePin}:${r.canonicalEnrollmentId}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="py-2">{r.canonicalEnrollmentId && <input type="checkbox" checked={selected.has(r.canonicalEnrollmentId)} onChange={() => toggle(r.canonicalEnrollmentId!)} />}</td>
              <td className="text-gray-700 dark:text-gray-200">{r.deviceName || '—'}</td>
              <td className="text-gray-500">{r.matchedRoleType ? t(`devicesPages.recon.role.${r.matchedRoleType}`) : ''}</td>
              <td className="font-mono text-xs">{digits(r.devicePin)}</td>
              <td><MismatchBadge type={r.mismatchType} /></td>
              <td>{r.hasFingerprintEvidence ? <span className="text-xs text-indigo-500">{t('devicesPages.recon.inDrais')}</span> : <span className="text-xs text-gray-400">{t('devicesPages.recon.none')}</span>}</td>
              <td className="text-xs text-gray-400">{fmt(r.lastSeenOnDeviceAt, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mismatches (grouped) ─────────────────────────────────────────────
function MismatchesTab({ rows }: { rows: ReconItem[] }) {
  const { t, digits } = useI18n();
  if (rows.length === 0) return <Empty msg={t('devicesPages.recon.emptyMismatch')} />;
  const groups = rows.reduce<Record<string, ReconItem[]>>((acc, r) => { (acc[r.mismatchType] ??= []).push(r); return acc; }, {});
  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([type, list]) => (
        <div key={type}>
          <div className="flex items-center gap-2 mb-1"><MismatchBadge type={type} /><span className="text-xs text-gray-400">{digits(list.length)}</span></div>
          <div className="space-y-1">
            {list.map(r => (
              <div key={`${r.devicePin}:${type}`} className="flex items-center gap-3 text-sm bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
                <span className="font-mono text-xs text-gray-500">{t('devicesPages.recon.pinRef', { pin: r.devicePin })}</span>
                <span className="text-gray-700 dark:text-gray-200">{r.deviceName || '—'}</span>
                {r.notes && <span className="text-xs text-gray-400 ms-auto">{noteText(t, r.notes)}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Orphan templates ─────────────────────────────────────────────────
function OrphansTab({ sn, rows, onChanged, setActionPin, actionPin }: {
  sn: string; rows: ReconItem[]; onChanged: () => void;
  setActionPin: (p: string | null) => void; actionPin: string | null;
}) {
  const { t, lang } = useI18n();
  if (rows.length === 0) return <Empty msg={t('devicesPages.recon.emptyOrphans')} />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">{t('devicesPages.recon.orphansHelp')}</p>
      {rows.map(r => (
        <div key={r.devicePin} className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-orange-500" />
              <div>
                <div className="text-sm font-medium">{t('devicesPages.recon.pinRef', { pin: r.devicePin })} {r.deviceName ? `· ${r.deviceName}` : ''}</div>
                <div className="text-xs text-gray-400">{noteText(t, r.notes)} · {fmt(r.lastSeenOnDeviceAt, lang)}</div>
              </div>
            </div>
            <ActionBtn label={t('devicesPages.recon.btn.attach')} icon={UserPlus} primary onClick={() => setActionPin(actionPin === r.devicePin ? null : r.devicePin)} />
          </div>
          {actionPin === r.devicePin && (
            <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3">
              <ResolvePanel sn={sn} item={r} onDone={() => { setActionPin(null); onChanged(); }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Activity (commands + audit) ──────────────────────────────────────
function ActivityTab({ activity, onRefresh }: { activity: any; onRefresh: () => void }) {
  const { t, lang } = useI18n();
  const commands = activity?.commands ?? [];
  const audit = activity?.audit ?? [];
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">{t('devicesPages.recon.commandQueue')}</h3>
          <button onClick={onRefresh} className="text-xs text-indigo-600 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {t('devicesPages.recon.refresh')}</button>
        </div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {commands.length === 0 ? <Empty msg={t('devicesPages.recon.noCommands')} /> : commands.map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 text-xs bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
              <span className={`px-1.5 py-0.5 rounded font-semibold ${c.status === 'acknowledged' ? 'bg-emerald-100 text-emerald-700' : c.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{t(`devicesPages.recon.cmd.${c.status}`, c.status)}</span>
              <span className="font-mono text-gray-500 truncate flex-1">{c.command}</span>
              <span className="text-gray-400">{fmt(c.created_at, lang)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('devicesPages.recon.directoryAudit')}</h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {audit.length === 0 ? <Empty msg={t('devicesPages.recon.noAudit')} /> : audit.map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 text-xs bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded px-3 py-1.5">
              <span className="font-semibold text-indigo-600">{t(`devicesPages.recon.audit.${a.action}`, a.action)}</span>
              {a.device_user_pin && <span className="font-mono text-gray-500">{t('devicesPages.recon.pinRef', { pin: a.device_user_pin })}</span>}
              <span className="text-gray-400 ms-auto">{fmt(a.created_at, lang)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────
function ActionBtn({ label, icon: Icon, onClick, primary }: { label: string; icon: any; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} title={label}
      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded ${primary ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200'}`}>
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2"><Check className="w-7 h-7 text-emerald-400" /><p className="text-sm text-center max-w-sm">{msg}</p></div>;
}
async function act(sn: string, pin: string, body: any, onChanged: () => void) {
  try {
    await apiFetch(`/api/attendance/devices/${encodeURIComponent(sn)}/users/${encodeURIComponent(pin)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), successMessage: typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'تم' : 'Done',
    });
    onChanged();
  } catch { /* toast */ }
}
