'use client';

import { useState } from 'react';
import { X, Wifi, Globe, Loader, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/apiClient';
import { showToast } from '@/lib/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStrategy = 'local' | 'adms';

interface SyncResult {
  success: boolean;
  strategy: string;
  device_ip?: string;
  users_pulled?: number;
  templates_pulled?: number;
  users_matched?: number;
  users_orphaned?: number;
  users_name_updated?: number;
  fingerprints_added?: number;
  errors?: string[];
  message?: string;
  // ADMS-specific
  devices?: { device_sn: string; commands: string[] }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Default device IP shown in the local IP field */
  defaultDeviceIp?: string;
  /** Default device SN for ADMS strategy */
  defaultDeviceSn?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SyncDeviceModal({ open, onClose, defaultDeviceIp = '192.168.1.197', defaultDeviceSn = '' }: Props) {
  const [strategy, setStrategy]       = useState<SyncStrategy>('local');
  const [deviceIp, setDeviceIp]       = useState(defaultDeviceIp);
  const [deviceSn, setDeviceSn]       = useState(defaultDeviceSn);
  const [syncing, setSyncing]         = useState(false);
  const [result, setResult]           = useState<SyncResult | null>(null);
  const [phase, setPhase]             = useState<'idle' | 'pulling' | 'merging' | 'done' | 'error'>('idle');

  if (!open) return null;

  const handleClose = () => {
    if (syncing) return; // prevent close mid-sync
    setResult(null);
    setPhase('idle');
    onClose();
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setResult(null);
    setPhase('pulling');

    try {
      let res: SyncResult;
      if (strategy === 'local') {
        setPhase('pulling');
        res = await apiFetch('/api/sync/trigger-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_ip: deviceIp }),
          silent: true,
        });
      } else {
        setPhase('pulling');
        res = await apiFetch('/api/sync/trigger-adms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deviceSn ? { device_sn: deviceSn } : {}),
          silent: true,
        });
      }

      if (res?.success) {
        setPhase('done');
        setResult(res);
        if (strategy === 'local') {
          showToast('success', `Sync complete — ${res.users_pulled ?? 0} users, ${res.fingerprints_added ?? 0} fingerprints added`);
        } else {
          showToast('success', 'ADMS sync commands queued — device will push data when it checks in');
        }
      } else {
        throw new Error((res as any)?.error || 'Sync failed');
      }
    } catch (err: any) {
      setPhase('error');
      setResult({ success: false, strategy, message: err?.message || 'Sync failed' });
      showToast('error', err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const phaseLabel = {
    idle: '',
    pulling: strategy === 'local' ? 'Connecting to device and pulling data…' : 'Queueing ADMS commands…',
    merging: 'Merging data into DRAIS database…',
    done: 'Sync complete',
    error: 'Sync failed',
  }[phase];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sync from Device</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pull users &amp; fingerprints from ZKTeco K40</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={syncing}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Strategy selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sync Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <StrategyCard
                    active={strategy === 'local'}
                    icon={<Wifi className="w-5 h-5" />}
                    title="Local IP"
                    desc="Bridge talks to device directly on LAN (fast)"
                    onClick={() => !syncing && setStrategy('local')}
                  />
                  <StrategyCard
                    active={strategy === 'adms'}
                    icon={<Globe className="w-5 h-5" />}
                    title="Cloud ADMS"
                    desc="Queue commands — device pushes data next check-in"
                    onClick={() => !syncing && setStrategy('adms')}
                  />
                </div>
              </div>

              {/* Strategy-specific inputs */}
              {strategy === 'local' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Device IP Address
                  </label>
                  <input
                    type="text"
                    value={deviceIp}
                    onChange={e => setDeviceIp(e.target.value)}
                    disabled={syncing}
                    placeholder="192.168.1.197"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-60"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    The local bridge must be running. Leave blank to use the school&apos;s registered device IP.
                  </p>
                </div>
              )}

              {strategy === 'adms' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Device Serial (optional)
                  </label>
                  <input
                    type="text"
                    value={deviceSn}
                    onChange={e => setDeviceSn(e.target.value)}
                    disabled={syncing}
                    placeholder="GED7254601154 — leave blank for all devices"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-60"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Queues <code>DATA QUERY user</code> + <code>DATA QUERY templatev10</code> commands. The device pushes data back when it next contacts the ADMS server.
                  </p>
                </div>
              )}

              {/* Progress */}
              {syncing && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                  <Loader className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">{phaseLabel}</p>
                </div>
              )}

              {/* Result */}
              {result && !syncing && (
                <div className={`p-4 rounded-xl ${result.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {result.success
                      ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      : <AlertCircle  className="w-5 h-5 text-red-600 dark:text-red-400" />}
                    <span className={`font-semibold text-sm ${result.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                      {result.success ? 'Sync Successful' : 'Sync Failed'}
                    </span>
                  </div>

                  {result.success && result.strategy === 'local' && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <StatRow label="Users pulled"      value={result.users_pulled} />
                      <StatRow label="Templates pulled"  value={result.templates_pulled} />
                      <StatRow label="Matched"           value={result.users_matched} />
                      <StatRow label="Orphaned"          value={result.users_orphaned} />
                      <StatRow label="Names updated"     value={result.users_name_updated} />
                      <StatRow label="Fingerprints added" value={result.fingerprints_added} highlight />
                    </dl>
                  )}

                  {result.success && result.strategy === 'adms' && (
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {result.message}
                    </p>
                  )}

                  {!result.success && (
                    <p className="text-sm text-red-700 dark:text-red-300">{result.message}</p>
                  )}

                  {(result.errors?.length ?? 0) > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer">
                        {result.errors!.length} warning(s)
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-gray-500 list-disc list-inside">
                        {result.errors!.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={handleClose}
                disabled={syncing}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {result?.success ? 'Close' : 'Cancel'}
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60 shadow-sm"
              >
                {syncing
                  ? <><Loader className="w-4 h-4 animate-spin" /> Syncing…</>
                  : <><RefreshCw className="w-4 h-4" /> Start Sync</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StrategyCard({
  active, icon, title, desc, onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
        active
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
      }`}
    >
      <div className={active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}>{icon}</div>
      <span className={`text-sm font-medium ${active ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
        {title}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{desc}</span>
    </button>
  );
}

function StatRow({ label, value, highlight }: { label: string; value?: number; highlight?: boolean }) {
  return (
    <>
      <dt className="text-gray-600 dark:text-gray-400">{label}</dt>
      <dd className={`font-semibold ${highlight && (value ?? 0) > 0 ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white'}`}>
        {value ?? 0}
      </dd>
    </>
  );
}
