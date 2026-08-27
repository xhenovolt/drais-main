'use client';

/**
 * DB mode indicator + switcher.
 *
 * variant:
 *   'badge'  — compact pill for the desktop Topbar (navbar)
 *   'drawer' — row for the mobile drawer / sidebar
 *   'login'  — two-choice selector shown on the login screen before auth
 *
 * The login selector renders without an automatic API request. Selecting a
 * mode explicitly POSTs to the mode endpoint, which is the DB connection
 * boundary. After a successful switch the session may be DB-bound, so reload.
 *
 * The server's DbMode also has a third value, 'local-sqlite' (DRAIS V2) —
 * deliberately not modeled here, since /api/db-mode's POST refuses it (see
 * that route's header) and nothing in this app can reach it except by
 * hand-editing env/config outside the UI. If that ever happened, this
 * component would render it as if it were 'online' (a cosmetic mislabel
 * only) — the real symptom would be src/lib/db.ts's query() throwing on
 * every page anyway, since that mode has no mysql2 pool at all.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, HardDrive, Loader2 } from 'lucide-react';

type DbMode = 'online' | 'local-mysql';
interface Health { ok: boolean; mode: DbMode; database: string; host: string; error?: string }
interface ModeInfo {
  mode: DbMode;
  label: string;
  short: string;
  allowLocal: boolean;
  health: Health | null;
  otherHealth: Health | null;
}

function useDbMode(onSelected?: () => void) {
  const [info, setInfo] = useState<ModeInfo>({
    mode: 'online',
    label: 'Online Cloud',
    short: 'ONLINE',
    allowLocal: true,
    health: null,
    otherHealth: null,
  });
  const [switching, setSwitching] = useState<DbMode | null>(null);
  const [selectedMode, setSelectedMode] = useState<DbMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/db-mode', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((current: ModeInfo | null) => {
        if (!cancelled && current) {
          setInfo(current);
          setSelectedMode(current.mode);
        }
      })
      .catch(() => { /* mode display remains usable while the server starts */ });
    return () => { cancelled = true; };
  }, []);

  const switchTo = useCallback(async (mode: DbMode) => {
    setError(null);
    setSwitching(mode);
    try {
      const r = await fetch('/api/db-mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Switch failed'); return; }
      setInfo((current) => ({
        ...current,
        mode,
        label: mode === 'local-mysql' ? 'Local Server' : 'Online Cloud',
        short: mode === 'local-mysql' ? 'LOCAL' : 'ONLINE',
        health: j.health || null,
      }));
      setSelectedMode(mode);
      onSelected?.();
      // Session may be tied to the previous DB outside the login screen.
      if (!onSelected) window.location.href = '/login';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Switch failed');
    } finally {
      setSwitching(null);
    }
  }, [onSelected]);

  return { info, switching, selectedMode, error, switchTo };
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />;
}

export default function DbModeBadge({ variant = 'badge', onSelected }: { variant?: 'badge' | 'drawer' | 'login'; onSelected?: () => void }) {
  const { info, switching, selectedMode, error, switchTo } = useDbMode(onSelected);
  const isLocal = info.mode === 'local-mysql';
  const Icon = isLocal ? HardDrive : Cloud;
  const tone = isLocal
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';

  // ── Login: two-choice selector ──
  if (variant === 'login') {
    const choose = (m: DbMode) => {
      if (m === 'local-mysql' && !info.allowLocal) return;
      switchTo(m);
    };
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Connection</p>
        <div className="grid grid-cols-2 gap-2">
          {(['local-mysql', 'online'] as DbMode[]).map((m) => {
            const active = (selectedMode ?? info.mode) === m;
            const disabled = m === 'local-mysql' && !info.allowLocal;
            const h = m === info.mode ? info.health : info.otherHealth;
            return (
              <button
                key={m}
                type="button"
                onClick={() => choose(m)}
                disabled={disabled || switching !== null}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-gray-900 dark:text-white'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {m === 'local-mysql' ? <HardDrive className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                <span className="flex-1 text-left">{m === 'local-mysql' ? 'Offline (Local MySQL)' : 'Online Cloud'}</span>
                {switching === m ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : h ? <Dot ok={h.ok} /> : null}
              </button>
            );
          })}
        </div>
        {!info.allowLocal && (
          <p className="text-[11px] text-gray-400">Local mode is available in the desktop app.</p>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  const canSwitch = info.allowLocal;
  const target: DbMode = isLocal ? 'online' : 'local-mysql';

  // ── Drawer row ──
  if (variant === 'drawer') {
    return (
      <div className="px-3 py-2">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${tone}`}>
          <Icon className="w-4 h-4" />
          <span className="text-xs font-semibold flex-1">{info.label}</span>
          {info.health && <Dot ok={info.health.ok} />}
        </div>
        {canSwitch && (
          <button
            onClick={() => switchTo(target)}
            disabled={switching !== null}
            className="mt-1 w-full text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
          >
            {switching ? 'Switching…' : `Switch to ${target === 'local-mysql' ? 'Local Server' : 'Online Cloud'}`}
          </button>
        )}
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  // ── Topbar badge (default) ──
  return (
    <div className="relative group">
      <button
        onClick={() => canSwitch && switchTo(target)}
        disabled={!canSwitch || switching !== null}
        title={canSwitch ? `Switch to ${target}` : `${info.label}${info.health ? ` — ${info.health.database}` : ''}`}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tone} ${
          canSwitch ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
        }`}
      >
        {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
        {info.short}
        {info.health && <Dot ok={info.health.ok} />}
      </button>
      {error && (
        <span className="absolute right-0 top-full mt-1 text-[11px] text-red-600 whitespace-nowrap">{error}</span>
      )}
    </div>
  );
}
