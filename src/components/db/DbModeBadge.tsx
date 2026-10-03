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
 * The server's DbMode has a third value, 'local-sqlite' (DRAIS V2, Phase 7
 * sub-effort 22) — now modeled here as a real, switchable option, same
 * contract as local-mysql: POST /api/db-mode, a real health probe
 * (sqlite-health.ts server-side), reauthRequired on success. Selecting it
 * takes the user into the standalone Offline Workspace (/students/offline
 * etc. — sub-effort 21), NOT the normal dashboard: only those five pages'
 * own data access is SQLite-aware, so AuthContext.tsx's post-login/already-
 * authenticated redirects check the active mode and send local-sqlite users
 * there instead of /dashboard. Navigating elsewhere by hand in this mode
 * will still show broken data on any page outside that workspace — src/lib
 * /db.ts's ~435 query() call sites are unchanged, still mysql2-only
 * (Phase 8+ work, not done here).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, HardDrive, Database, Loader2 } from 'lucide-react';

type DbMode = 'online' | 'local-mysql' | 'local-sqlite';
interface Health { ok: boolean; mode: DbMode; database: string; host: string; error?: string }

const LABEL_FOR_MODE: Record<DbMode, string> = {
  online: 'Online Cloud',
  'local-mysql': 'Local Server',
  'local-sqlite': 'Local Server (SQLite)',
};
const ICON_FOR_MODE: Record<DbMode, typeof Cloud> = {
  online: Cloud,
  'local-mysql': HardDrive,
  'local-sqlite': Database,
};
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
    if (mode === 'online' && !info.allowLocal) {
      setSelectedMode('online');
      onSelected?.();
      setSwitching(null);
      return;
    }
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
        label: LABEL_FOR_MODE[mode],
        short: mode === 'online' ? 'ONLINE' : 'LOCAL',
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

const ALL_MODES: DbMode[] = ['online', 'local-mysql', 'local-sqlite'];

function toneFor(mode: DbMode): string {
  if (mode === 'online') return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
  if (mode === 'local-mysql') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300';
}

export default function DbModeBadge({ variant = 'badge', onSelected }: { variant?: 'badge' | 'drawer' | 'login'; onSelected?: () => void }) {
  const { info, switching, selectedMode, error, switchTo } = useDbMode(onSelected);
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = ICON_FOR_MODE[info.mode];
  const tone = toneFor(info.mode);

  // ── Login: three-choice selector ──
  if (variant === 'login') {
    const choose = (m: DbMode) => {
      if (m !== 'online' && !info.allowLocal) return;
      switchTo(m);
    };
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Connection</p>
        <div className="grid grid-cols-1 gap-2">
          {ALL_MODES.map((m) => {
            const active = (selectedMode ?? info.mode) === m;
            const disabled = m !== 'online' && !info.allowLocal;
            const h = m === info.mode ? info.health : info.otherHealth;
            const ModeIcon = ICON_FOR_MODE[m];
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
                <ModeIcon className="w-4 h-4" />
                <span className="flex-1 text-left">
                  {m === 'online' ? 'Online Cloud' : m === 'local-mysql' ? 'Offline (Local MySQL)' : 'Offline (Local SQLite)'}
                </span>
                {switching === m ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : h ? <Dot ok={h.ok} /> : null}
              </button>
            );
          })}
        </div>
        {!info.allowLocal && (
          <p className="text-[11px] text-gray-400">Local modes are available in the desktop app.</p>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  const canSwitch = info.allowLocal;
  const choices = ALL_MODES.filter((m) => m !== info.mode);

  const choose = (m: DbMode) => {
    setMenuOpen(false);
    switchTo(m);
  };

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
          <div className="mt-1 space-y-0.5">
            {choices.map((m) => (
              <button
                key={m}
                onClick={() => choose(m)}
                disabled={switching !== null}
                className="w-full text-left text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
              >
                {switching === m ? 'Switching…' : `Switch to ${LABEL_FOR_MODE[m]}`}
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  // ── Topbar badge (default) — click opens a small menu with the other
  // two modes, since a plain toggle no longer makes sense with three. ──
  return (
    <div className="relative">
      <button
        onClick={() => canSwitch && setMenuOpen((o) => !o)}
        disabled={!canSwitch || switching !== null}
        title={canSwitch ? 'Switch DB mode' : `${info.label}${info.health ? ` — ${info.health.database}` : ''}`}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tone} ${
          canSwitch ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
        }`}
      >
        {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
        {info.short}
        {info.health && <Dot ok={info.health.ok} />}
      </button>
      {menuOpen && canSwitch && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {choices.map((m) => {
            const ModeIcon = ICON_FOR_MODE[m];
            return (
              <button
                key={m}
                onClick={() => choose(m)}
                disabled={switching !== null}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <ModeIcon className="w-3.5 h-3.5" />
                Switch to {LABEL_FOR_MODE[m]}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <span className="absolute right-0 top-full mt-1 text-[11px] text-red-600 whitespace-nowrap">{error}</span>
      )}
    </div>
  );
}
