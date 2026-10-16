'use client';

/**
 * Identity Matching — device users ↔ DRAIS staff reconciliation console.
 *
 * Pull the device directory (TCP), score every unmapped PIN against
 * unenrolled DRAIS staff, and let the administrator confirm mappings:
 *
 *   Auto (≥90%)      — bulk-confirmable, still one explicit click
 *   Review (60–89%)  — pick among top candidates, confirm per row
 *   Unmatched (<60%) — visible so nobody is silently lost
 *
 * The device is never modified; confirmations create canonical
 * biometric_enrollments rows (device PIN → DRAIS person), fully audited.
 */

import React, { useState } from 'react';
import {
  Users, Loader, CheckCircle, XCircle, RefreshCw, ShieldCheck,
  AlertTriangle, Fingerprint, Link2,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { useI18n } from '@/components/i18n/I18nProvider';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Candidate {
  refId: number; roleType: 'staff' | 'student'; name: string;
  position?: string | null; confidence: number;
}
interface Item {
  device: { pin: string; name: string; privilege?: number | null; card?: string | null };
  best: Candidate | null;
  alternatives: Candidate[];
  tier: 'auto' | 'review' | 'unmatched';
  contested?: boolean;
}
interface Report {
  deviceSn: string; usersOnDevice: number; alreadyMapped: number;
  auto: number; review: number; unmatched: number; contested: number;
  items: Item[];
  mappedPins: Array<{ pin: string; name: string | null; mappedTo: string | null }>;
  source: string; warnings: string[];
}

export default function IdentityMatchingPage() {
  const { t, rich, lang, digits, formatPercent } = useI18n();
  const arrow = lang === 'ar' ? '←' : '→';
  const errText = (e: any) => (lang === 'ar' ? t('devicesPages.idMatch.requestFailed') : e.message);
  // Engine warnings are English sentences (device-user-sync); shown in the interface language.
  const warning = (w: string) => {
    const m = /^TCP inventory failed \((.*)\) — using the cached directory\.$/.exec(w);
    if (m) return t('devicesPages.idMatch.warn.tcp', { reason: m[1] === 'no users returned' ? t('devicesPages.idMatch.warn.noUsers') : m[1] });
    if (w === 'No LAN IP for this device — using the cached directory.') return t('devicesPages.idMatch.warn.noLan');
    return w;
  };
  const [deviceSn, setDeviceSn] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [decided, setDecided] = useState<Record<string, 'confirmed' | 'rejected'>>({});

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);
  const devices = devicesData?.data || [];

  React.useEffect(() => {
    if (!deviceSn && devices.length > 0) setDeviceSn(devices[0].sn);
  }, [devices, deviceSn]);

  const api = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/attendance/identity-matching', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json;
  };

  const runMatching = async () => {
    if (!deviceSn) return showToast('error', t('devicesPages.idMatch.selectDevice'));
    setBusy('run'); setReport(null); setDecided({});
    try {
      const json = await api({ action: 'run', device_sn: deviceSn });
      setReport(json.report);
      showToast('success', t('devicesPages.idMatch.matched', { n: json.report.usersOnDevice }));
    } catch (err: any) {
      showToast('error', errText(err));
    } finally { setBusy(null); }
  };

  const confirm = async (pin: string, cand: Candidate) => {
    setBusy(`confirm:${pin}`);
    try {
      await api({ action: 'confirm', device_sn: deviceSn, pin, role_type: cand.roleType, ref_id: cand.refId });
      setDecided(d => ({ ...d, [pin]: 'confirmed' }));
      showToast('success', t('devicesPages.idMatch.mapped', { pin, name: cand.name }));
    } catch (err: any) {
      showToast('error', errText(err));
    } finally { setBusy(null); }
  };

  const reject = async (pin: string) => {
    setBusy(`reject:${pin}`);
    try {
      await api({ action: 'reject', device_sn: deviceSn, pin });
      setDecided(d => ({ ...d, [pin]: 'rejected' }));
    } catch (err: any) {
      showToast('error', errText(err));
    } finally { setBusy(null); }
  };

  const confirmAllAuto = async () => {
    if (!report) return;
    if (!window.confirm(t('devicesPages.idMatch.confirmAll', { n: report.auto }))) return;
    setBusy('confirm_auto');
    try {
      const json = await api({ action: 'confirm_auto', device_sn: deviceSn });
      const d: Record<string, 'confirmed'> = {};
      for (const it of report.items) {
        if (it.tier === 'auto' && !it.contested) d[it.device.pin] = 'confirmed';
      }
      setDecided(prev => ({ ...prev, ...d }));
      showToast('success', `${t('devicesPages.idMatch.confirmedN', { n: json.confirmed })}${json.failed ? t('devicesPages.idMatch.failedN', { n: json.failed }) : ''}`);
    } catch (err: any) {
      showToast('error', errText(err));
    } finally { setBusy(null); }
  };

  const confBadge = (c: number) => (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
      c >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : c >= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
      {formatPercent(c)}
    </span>
  );

  const tierItems = (tier: Item['tier']) => (report?.items || []).filter(i => i.tier === tier);

  const MatchRow = ({ it }: { it: Item }) => {
    const pin = it.device.pin;
    const done = decided[pin];
    return (
      <div className={`p-3 rounded-lg border ${done === 'confirmed'
        ? 'border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10'
        : done === 'rejected' ? 'border-gray-200 dark:border-gray-700 opacity-50'
        : 'border-gray-200 dark:border-gray-700'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-28">
            <div className="text-[10px] uppercase text-gray-400">{t('devicesPages.idMatch.deviceUser')}</div>
            <div className="font-mono text-sm text-gray-900 dark:text-white">{t('devicesPages.idMatch.pin', { pin })}</div>
            <div className="text-sm text-gray-700 dark:text-gray-300">{it.device.name || '—'}</div>
            <div className="text-[10px] text-gray-400">
              {it.device.privilege === 14 ? t('devicesPages.idMatch.admin') : t('devicesPages.idMatch.user')}{it.device.card ? t('devicesPages.idMatch.card', { card: it.device.card }) : ''}
            </div>
          </div>
          <Link2 className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          <div className="flex-1 min-w-52 space-y-1.5">
            {it.best ? [it.best, ...it.alternatives].map((c, idx) => (
              <div key={`${c.roleType}:${c.refId}`} className="flex items-center gap-2">
                {confBadge(c.confidence)}
                <span className="text-sm text-gray-900 dark:text-white">{c.name}</span>
                {c.position && <span className="text-xs text-gray-400">{c.position}</span>}
                {idx === 0 && it.contested && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                    {t('devicesPages.idMatch.contested')}
                  </span>
                )}
                {!done && (
                  <button
                    onClick={() => confirm(pin, c)}
                    disabled={busy !== null}
                    className="ms-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {busy === `confirm:${pin}` ? <Loader className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    {t('devicesPages.idMatch.confirmMatch')}
                  </button>
                )}
              </div>
            )) : (
              <div className="text-sm text-gray-400">{t('devicesPages.idMatch.noStaff')}</div>
            )}
          </div>
          {done === 'confirmed' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
              <CheckCircle className="w-3.5 h-3.5" /> {t('devicesPages.idMatch.mappedDone')}
            </span>
          )}
          {!done && (
            <button
              onClick={() => reject(pin)}
              disabled={busy !== null}
              className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs disabled:opacity-50"
            >
              {t('devicesPages.idMatch.skip')}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Fingerprint className="w-7 h-7 text-indigo-500" />
          {t('devicesPages.idMatch.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('devicesPages.idMatch.subtitle')}
        </p>
      </div>

      {/* Device + run */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row items-start sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.idMatch.device')}</label>
          <select
            value={deviceSn} onChange={(e) => setDeviceSn(e.target.value)}
            className="w-full sm:w-80 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          >
            <option value="">{t('devicesPages.idMatch.selectDeviceOpt')}</option>
            {devices.map((d: any) => (
              <option key={d.sn} value={d.sn}>{d.sn} {d.device_name ? `— ${d.device_name}` : ''}</option>
            ))}
          </select>
        </div>
        <button
          onClick={runMatching}
          disabled={busy !== null || !deviceSn}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'run' ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t('devicesPages.idMatch.run')}
        </button>
      </div>

      {report && (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t('devicesPages.idMatch.sum.onDevice', { n: report.usersOnDevice })}</span>
            <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{t('devicesPages.idMatch.sum.mapped', { n: report.alreadyMapped })}</span>
            <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('devicesPages.idMatch.sum.auto', { n: report.auto })}</span>
            <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">{t('devicesPages.idMatch.sum.review', { n: report.review })}</span>
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">{t('devicesPages.idMatch.sum.unmatched', { n: report.unmatched })}</span>
            {report.source !== 'tcp' && (
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t('devicesPages.idMatch.cached')}</span>
            )}
          </div>

          {report.warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-xs space-y-1">
              {report.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{warning(w)}</div>
              ))}
            </div>
          )}

          {/* Auto matched */}
          {tierItems('auto').length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                  {t('devicesPages.idMatch.autoTitle')}
                </h2>
                <button
                  onClick={confirmAllAuto}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50"
                >
                  {busy === 'confirm_auto' ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  {t('devicesPages.idMatch.confirmAllBtn')}
                </button>
              </div>
              {tierItems('auto').map(it => <MatchRow key={it.device.pin} it={it} />)}
            </div>
          )}

          {/* Review */}
          {tierItems('review').length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-yellow-500" />
                {t('devicesPages.idMatch.reviewTitle')}
              </h2>
              {tierItems('review').map(it => <MatchRow key={it.device.pin} it={it} />)}
            </div>
          )}

          {/* Unmatched */}
          {tierItems('unmatched').length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <XCircle className="w-4 h-4 text-gray-400" />
                {t('devicesPages.idMatch.unmatchedTitle')}
              </h2>
              {tierItems('unmatched').map(it => <MatchRow key={it.device.pin} it={it} />)}
            </div>
          )}

          {/* Already mapped (read-only) */}
          {report.mappedPins.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-500 dark:text-gray-400 font-medium">
                {t('devicesPages.idMatch.mappedPins', { n: report.mappedPins.length })}
              </summary>
              <div className="mt-2 space-y-1">
                {report.mappedPins.map(m => (
                  <div key={m.pin} className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {t('devicesPages.idMatch.pin', { pin: m.pin })} · {m.name || '—'} {arrow} {m.mappedTo || '—'}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-500 text-center">
        {t('devicesPages.idMatch.footer')}
      </div>
    </div>
  );
}
