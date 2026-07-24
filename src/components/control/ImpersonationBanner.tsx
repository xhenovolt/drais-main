'use client';
/**
 * Persistent banner shown across the school app whenever the current session
 * is a Control-Center impersonation. Makes it impossible to forget you are
 * operating inside a school as Xhenvolt, and offers a one-click Exit back to
 * /control. Renders nothing for normal school sessions.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react';

export default function ImpersonationBanner() {
  const [state, setState] = useState<any>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/impersonation-status', { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (alive) setState(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const exit = useCallback(async () => {
    setExiting(true);
    try {
      const r = await fetch('/api/control-center/impersonate', { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      window.location.href = j.redirect || '/control';
    } catch { window.location.href = '/control'; }
  }, []);

  if (!state?.impersonating) return null;
  return (
    <div className="sticky top-0 z-[100] w-full bg-amber-500 text-amber-950 border-b border-amber-600">
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium min-w-0">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">Xhenvolt Control — operating inside <strong>{state.school}</strong>{state.operating_as ? ` as ${state.operating_as}` : ''}. Everything you do here is on the school's live data.</span>
        </span>
        <button onClick={exit} disabled={exiting}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/90 text-amber-50 text-xs font-semibold hover:bg-amber-950 disabled:opacity-60 flex-shrink-0">
          {exiting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />} Exit to Control
        </button>
      </div>
    </div>
  );
}
