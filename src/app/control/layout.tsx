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
import { Shield, LayoutDashboard, School, Activity, ScrollText, Users, HardDrive, CreditCard, LogOut, Loader2 } from 'lucide-react';

const NAV = [
  { href: '/control/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/control/schools', label: 'Schools', icon: School },
  { href: '/control/devices', label: 'Devices', icon: HardDrive },
  { href: '/control/plans', label: 'Plans', icon: CreditCard },
  { href: '/control/system-health', label: 'System Health', icon: Activity },
  { href: '/control/operators', label: 'Operators', icon: Users },
  { href: '/control/audit', label: 'Audit Log', icon: ScrollText },
];

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'anon' | 'authed'>('loading');
  const [user, setUser] = useState<any>(null);

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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top chrome */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span className="font-bold tracking-wide">DRAIS CONTROL CENTER</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold uppercase">Xhenvolt internal</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400 hidden sm:inline">{user?.name} · <span className="text-slate-500">{user?.role?.replace('XHENVOLT_', '')}</span></span>
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
