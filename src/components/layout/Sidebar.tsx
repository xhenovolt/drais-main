'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getNavigationItems, MenuItem, filterMenuByRole } from '@/lib/navigationConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';

/**
 * Enterprise Sidebar — Desktop only (hidden on mobile).
 * Reads navigation from navigationConfig — no hardcoded routes.
 * Features: role-based filtering, active-route highlight, smooth group collapse.
 */
export const Sidebar = () => {
  const pathname = usePathname();
  const { t }    = useI18n();
  const { user } = useAuth() || {};
  const { school } = useSchoolConfig();

  const navigationItems = useMemo(() => {
    const tWrapper = (key: string, fallback?: string) => t(key) || fallback || key;
    const items    = getNavigationItems(tWrapper);
    if (!user) return items;
    const hasRole      = (slug: string) => {
      if (!user.roles) return false;
      return typeof user.roles[0] === 'string'
        ? (user.roles as string[]).some(r => r.toLowerCase() === slug.toLowerCase())
        : (user.roles as any[]).some((r: any) => (r.slug || r.name || '').toLowerCase() === slug.toLowerCase());
    };
    return filterMenuByRole(items, hasRole, !!user.isSuperAdmin);
  }, [t, user]);

  // Determine which groups should start expanded (ones that contain the current path)
  const defaultExpanded = useMemo(() => {
    const expanded = new Set<string>();
    // Restore from localStorage
    try {
      const stored = localStorage.getItem('drais-sidebar-expanded');
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        parsed.forEach(k => expanded.add(k));
      }
    } catch {}
    // Always expand groups containing the active route
    for (const item of navigationItems) {
      if (item.children?.some(c => c.href && (pathname === c.href || pathname.startsWith(c.href + '/')))) {
        expanded.add(item.key);
      }
    }
    return expanded;
  }, [navigationItems, pathname]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  // Sync expanded state to localStorage
  useEffect(() => {
    try { localStorage.setItem('drais-sidebar-expanded', JSON.stringify(Array.from(expanded))); } catch {}
  }, [expanded]);

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  const isActive = (href?: string) =>
    !!href && (pathname === href || pathname.startsWith(href + '/'));

  const hasActiveChild = (item: MenuItem) =>
    item.children?.some(c => isActive(c.href)) ?? false;

  const renderItem = (item: MenuItem) => {
    const active      = isActive(item.href);
    const childActive = hasActiveChild(item);
    const open        = expanded.has(item.key);

    if (item.href && !item.children?.length) {
      // Leaf link
      return (
        <Link
          key={item.key}
          href={item.href}
          className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
            active
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold border-l-2 border-blue-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
      );
    }

    // Group with children
    return (
      <div key={item.key} className="space-y-0.5">
        <button
          onClick={() => toggle(item.key)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
            childActive || open
              ? 'text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-700/40'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${childActive ? 'text-blue-500' : ''}`}>
            {item.icon}
          </span>
          <span className="flex-1 truncate font-medium">{item.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 flex-shrink-0 transition-transform text-slate-400 ${open ? '-rotate-180' : ''}`}
          />
        </button>

        {open && item.children && (
          <div className="ml-3 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
            {item.children.map(child => {
              const childIsActive = isActive(child.href);
              return (
                <Link
                  key={child.key}
                  href={child.href || '#'}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-all ${
                    childIsActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">{child.icon}</span>
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="hidden md:flex w-60 flex-col h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          D
        </div>
        <div className="min-w-0">
          <div className="font-bold text-slate-900 dark:text-white text-sm">DRAIS</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {school?.name ?? 'School OS'}
          </div>
        </div>
      </div>

      {/* Nav — scrollable */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 custom-scroll">
        {navigationItems.length > 0
          ? navigationItems.map(item => renderItem(item))
          : <p className="text-xs text-slate-400 px-3 py-2">No modules available</p>
        }
      </nav>

      {/* Footer */}
      {school && (
        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{school.name}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500">Multi-tenant · DRAIS v4</div>
        </div>
      )}
    </aside>
  );
};
