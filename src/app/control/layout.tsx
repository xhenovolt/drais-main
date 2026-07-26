'use client';

/**
 * DRAIS Control Center shell — the Xhenvolt operating console.
 * Deliberately distinct from the school app (dark slate chrome) so an
 * operator always knows which security domain they are in. Session checks
 * hit /api/control-center/auth — never the school session.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, LayoutDashboard, School, Activity, ScrollText, Users, HardDrive, CreditCard, TrendingUp, LogOut, Loader2, Monitor, Sun, Moon, Contrast } from 'lucide-react';

const NAV = [
  { href: '/control/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/control/schools', label: 'Schools', icon: School },
  { href: '/control/devices', label: 'Devices', icon: HardDrive },
  { href: '/control/plans', label: 'Plans', icon: CreditCard },
  { href: '/control/bi', label: 'Business', icon: TrendingUp },
  { href: '/control/system-health', label: 'System Health', icon: Activity },
  { href: '/control/operators', label: 'Operators', icon: Users },
  { href: '/control/audit', label: 'Audit Log', icon: ScrollText },
];

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'anon' | 'authed'>('loading');
  const [user, setUser] = useState<any>(null);

  // Control Center theme — no longer forced dark. Persisted per operator.
  const [theme, setTheme] = useState<'system' | 'light' | 'dark' | 'contrast'>('dark');
  // 'system' is resolved to a concrete light/dark in JS so the CSS only needs
  // light + contrast blocks (no media-query duplication).
  const [resolved, setResolved] = useState<'light' | 'dark' | 'contrast'>('dark');
  useEffect(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('drais_control_theme')) as any;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    if (theme !== 'system') { setResolved(theme); return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setResolved(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  const cycleTheme = useCallback(() => {
    setTheme((t) => {
      const order = ['system', 'light', 'dark', 'contrast'] as const;
      const next = order[(order.indexOf(t) + 1) % order.length];
      try { localStorage.setItem('drais_control_theme', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const check = useCallback(async () => {
    try {
      const r = await fetch('/api/control-center/auth', { cache: 'no-store' });
      const j = await r.json();
      if (j.authenticated) { setUser(j.user); setState('authed'); }
      else {
        setState('anon');
        if (pathname !== '/control') router.replace('/control');
      }
    } catch { setState('anon'); }
  }, [pathname, router]);
  useEffect(() => { check(); }, [check]);

  const logout = useCallback(async () => {
    await fetch('/api/control-center/auth', { method: 'DELETE' });
    router.replace('/control');
    setState('anon'); setUser(null);
  }, [router]);

  // The entry page (/control) renders its own setup/login card unauthenticated.
  if (pathname === '/control') return <div className="min-h-screen bg-slate-950">{children}</div>;

  if (state === 'loading') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>;
  }
  if (state === 'anon') return null; // redirecting

  return (
    <div data-theme={resolved} className="ctl min-h-screen bg-slate-950 text-slate-100 control-print-area">
      {/* Theme layer — remaps the dark slate palette for light / high-contrast
          without rewriting every page. Dark = the classes as-is. */}
      <style>{`
        /* ── LIGHT ───────────────────────────────────────────────────────── */
        /* Set the base colour too, not just the background: text with no explicit
           colour class (e.g. the brand wordmark) inherits this instead of the
           dark theme's light default. */
        .ctl[data-theme="light"] { color-scheme: light; background:#f1f5f9 !important; color:#0f172a !important; }
        .ctl[data-theme="light"] [class*="bg-slate-950"] { background:#e2e8f0 !important; }
        .ctl[data-theme="light"] [class*="bg-slate-900"] { background:#ffffff !important; }
        .ctl[data-theme="light"] [class*="bg-slate-800"] { background:#eef2f7 !important; }
        /* body / heading text */
        .ctl[data-theme="light"] [class*="text-slate-100"],
        .ctl[data-theme="light"] [class*="text-slate-200"],
        .ctl[data-theme="light"] [class*="text-slate-300"] { color:#0f172a !important; }
        /* muted / secondary text (kept readable, not pale) */
        .ctl[data-theme="light"] [class*="text-slate-400"],
        .ctl[data-theme="light"] [class*="text-slate-500"],
        .ctl[data-theme="light"] [class*="text-slate-600"] { color:#475569 !important; }
        /* coloured status text — darken the light -200/300/400 shades so chips
           are legible on their pale tinted backgrounds (this was the invisible text) */
        .ctl[data-theme="light"] [class*="text-emerald-2"], .ctl[data-theme="light"] [class*="text-emerald-3"], .ctl[data-theme="light"] [class*="text-emerald-4"] { color:#047857 !important; }
        .ctl[data-theme="light"] [class*="text-rose-2"], .ctl[data-theme="light"] [class*="text-rose-3"], .ctl[data-theme="light"] [class*="text-rose-4"] { color:#be123c !important; }
        .ctl[data-theme="light"] [class*="text-amber-2"], .ctl[data-theme="light"] [class*="text-amber-3"], .ctl[data-theme="light"] [class*="text-amber-4"] { color:#b45309 !important; }
        .ctl[data-theme="light"] [class*="text-sky-2"], .ctl[data-theme="light"] [class*="text-sky-3"], .ctl[data-theme="light"] [class*="text-sky-4"] { color:#0369a1 !important; }
        .ctl[data-theme="light"] [class*="text-indigo-2"], .ctl[data-theme="light"] [class*="text-indigo-3"], .ctl[data-theme="light"] [class*="text-indigo-4"] { color:#4338ca !important; }
        .ctl[data-theme="light"] [class*="border-slate-7"], .ctl[data-theme="light"] [class*="border-slate-8"] { border-color:#e2e8f0 !important; }
        .ctl[data-theme="light"] input, .ctl[data-theme="light"] select { background:#ffffff !important; color:#0f172a !important; border-color:#cbd5e1 !important; }
        .ctl[data-theme="light"] ::placeholder { color:#94a3b8 !important; }

        /* ── HIGH CONTRAST ───────────────────────────────────────────────── */
        .ctl[data-theme="contrast"] { color-scheme: dark; background:#000 !important; color:#fff; }
        .ctl[data-theme="contrast"] [class*="bg-slate"] { background:#000 !important; }
        .ctl[data-theme="contrast"] [class*="text-slate"] { color:#fff !important; }
        .ctl[data-theme="contrast"] [class*="border-slate"] { border-color:#fff !important; }
        .ctl[data-theme="contrast"] [class*="text-indigo"] { color:#c7d2fe !important; }
        .ctl[data-theme="contrast"] input, .ctl[data-theme="contrast"] select { background:#000 !important; color:#fff !important; border-color:#fff !important; }
      `}</style>
      {/* Print: drop the dark chrome to a clean white sheet so exports are legible. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .control-print-area { background: #fff !important; }
          .control-print-area, .control-print-area * { color: #111 !important; }
          .control-print-area [class*="bg-slate"] { background: #fff !important; border-color: #d4d4d8 !important; box-shadow: none !important; }
        }
      `}</style>
      {/* Top chrome */}
      <header className="no-print border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span className="font-bold tracking-wide">DRAIS CONTROL CENTER</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold uppercase">Xhenvolt internal</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400 hidden sm:inline">{user?.name} · <span className="text-slate-500">{user?.role?.replace('XHENVOLT_', '')}</span></span>
            <button onClick={cycleTheme} title={`Theme: ${theme} (click to change)`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs capitalize">
              {theme === 'system' ? <Monitor className="w-3.5 h-3.5" /> : theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : theme === 'contrast' ? <Contrast className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{theme}</span>
            </button>
            <button onClick={logout} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 whitespace-nowrap ${
                pathname.startsWith(href)
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              <Icon className="w-4 h-4" /> {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
