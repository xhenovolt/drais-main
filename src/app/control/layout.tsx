'use client';

/**
 * DRAIS Control Center shell — the Xhenvolt operating console.
 * Deliberately distinct from the school app (dark slate chrome) so an
 * operator always knows which security domain they are in. Session checks
 * hit /api/control-center/auth — never the school session.
 *
 * Navigation: a grouped sidebar on desktop (lg+), a 3-item bottom nav plus a
 * "More" drawer on mobile — replaces the old horizontally-scrolling topbar,
 * which stopped scaling once the link count grew.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, ShieldCheck, LayoutDashboard, School, Activity, ScrollText, Users, HardDrive, CreditCard, TrendingUp, LogOut, Loader2, Monitor, Sun, Moon, Contrast, MessageSquare, Send, BookOpen, Lock, KeyRound, BadgeCheck, Menu, X } from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { href: '/control/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Schools',
    items: [
      { href: '/control/schools', label: 'Schools', icon: School },
      { href: '/control/devices', label: 'Devices', icon: HardDrive },
      { href: '/control/plans', label: 'Plans', icon: CreditCard },
      { href: '/control/id-cards/watermark', label: 'ID Card Watermark', icon: BadgeCheck },
    ],
  },
  {
    label: 'Messaging',
    items: [
      { href: '/control/sms', label: 'SMS', icon: MessageSquare },
      { href: '/control/sms/providers', label: 'SMS Providers', icon: ShieldCheck },
      { href: '/control/sms/routing', label: 'School SMS Routing', icon: Send },
      { href: '/control/sms/pricing', label: 'SMS Pricing & Top-ups', icon: CreditCard },
      // Distinct from SMS (billing/quota economics): Comms is cross-channel
      // message oversight (delivery/history), starting with WhatsApp.
      { href: '/control/comm', label: 'Comms', icon: Send },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/control/bi', label: 'Business', icon: TrendingUp },
      { href: '/control/system-health', label: 'System Health', icon: Activity },
      // Distinct from System Health (current metrics): Sentinel is the
      // incident-detection, self-monitoring, and SMS-alerting layer.
      { href: '/control/sentinel', label: 'Sentinel', icon: ShieldCheck },
    ],
  },
  {
    label: 'Access & security',
    items: [
      { href: '/control/operators', label: 'Operators', icon: Users },
      { href: '/control/sessions', label: 'Sessions', icon: Monitor },
      // Placed next to Operators, not under Schools: an operator looking for
      // "someone cannot sign in" reaches for people, not for a school record.
      { href: '/control/user-locks', label: 'Account Locks', icon: Lock },
      { href: '/control/database-settings', label: 'Database Access', icon: KeyRound },
      { href: '/control/audit', label: 'Audit Log', icon: ScrollText },
    ],
  },
  {
    label: 'Help',
    items: [
      { href: '/control/docs', label: 'Docs', icon: BookOpen },
    ],
  },
];

// Bottom nav (mobile) surfaces only the highest-traffic destinations;
// everything else lives behind "More".
const MOBILE_PRIMARY_HREFS = ['/control/dashboard', '/control/schools', '/control/sms'];

function NavLinks({ onNavigate, pathname }: { onNavigate?: () => void; pathname: string }) {
  return (
    <nav className="p-3 space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href} href={href} onClick={onNavigate}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm ${
                  pathname.startsWith(href)
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}
              >
                <Icon className="w-4 h-4 shrink-0" /> <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'anon' | 'authed'>('loading');
  const [user, setUser] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

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

  const flatNav = NAV_GROUPS.flatMap((g) => g.items);
  const mobilePrimary = MOBILE_PRIMARY_HREFS.map((href) => flatNav.find((i) => i.href === href)).filter(Boolean) as typeof flatNav;

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
      {/* Top chrome — branding, theme, sign out. Navigation lives in the
          sidebar (desktop) / bottom nav (mobile) below, not here. */}
      <header className="no-print border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
        <div className="w-full px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <Shield className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="font-bold tracking-wide text-sm sm:text-base whitespace-nowrap">
              <span className="hidden sm:inline">DRAIS CONTROL CENTER</span>
              <span className="sm:hidden">DRAIS CONTROL</span>
            </span>
            <span className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold uppercase shrink-0">Xhenvolt internal</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0">
            <span className="text-slate-400 hidden lg:inline">{user?.name} · <span className="text-slate-500">{user?.role?.replace('XHENVOLT_', '')}</span></span>
            <button onClick={cycleTheme} title={`Theme: ${theme} (click to change)`}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs capitalize">
              {theme === 'system' ? <Monitor className="w-3.5 h-3.5" /> : theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : theme === 'contrast' ? <Contrast className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{theme}</span>
            </button>
            <button onClick={logout} title="Sign out" className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"><LogOut className="w-3.5 h-3.5" /><span className="hidden sm:inline">Sign out</span></button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar — grouped, sticky under the header, its own scroll. */}
        <aside className="no-print hidden lg:block w-60 shrink-0 border-r border-slate-800 bg-slate-900/40 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <NavLinks pathname={pathname} />
        </aside>

        <main className="flex-1 min-w-0 max-w-6xl mx-auto px-4 py-6 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav — 3 highest-traffic links plus "More". */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800 bg-slate-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {mobilePrimary.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                pathname.startsWith(href) ? 'text-indigo-300' : 'text-slate-400'}`}>
              <Icon className="w-5 h-5" /> {label}
            </Link>
          ))}
          <button onClick={() => setDrawerOpen(true)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${drawerOpen ? 'text-indigo-300' : 'text-slate-400'}`}>
            <Menu className="w-5 h-5" /> More
          </button>
        </div>
      </nav>

      {/* Mobile "More" drawer — the full grouped nav, off the bottom bar. */}
      {drawerOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full bg-slate-900 border-l border-slate-800 overflow-y-auto">
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800">
              <span className="text-sm font-semibold">Menu</span>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800"><X className="w-4 h-4" /></button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
