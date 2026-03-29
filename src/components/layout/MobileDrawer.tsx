'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ChevronDown } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getNavigationItems, MenuItem, filterMenuByRole } from '@/lib/navigationConfig';
import { useAuth } from '@/contexts/AuthContext';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Mobile Drawer — mirrors desktop Sidebar completely.
 * Slides in from left; responds to same navigationConfig.
 */
export const MobileDrawer = ({ isOpen, onClose }: MobileDrawerProps) => {
  const pathname = usePathname();
  const { t }    = useI18n();
  const { user } = useAuth() || {};

  const navigationItems = useMemo(() => {
    const tWrapper = (key: string, fallback?: string) => t(key) || fallback || key;
    const items    = getNavigationItems(tWrapper);
    if (!user) return items;
    const hasRole = (slug: string) => {
      if (!user.roles) return false;
      return typeof user.roles[0] === 'string'
        ? (user.roles as string[]).some(r => r.toLowerCase() === slug.toLowerCase())
        : (user.roles as any[]).some((r: any) => (r.slug || r.name || '').toLowerCase() === slug.toLowerCase());
    };
    return filterMenuByRole(items, hasRole, !!user.isSuperAdmin);
  }, [t, user]);

  const defaultExpanded = useMemo(() => {
    const s = new Set<string>();
    for (const item of navigationItems) {
      if (item.children?.some(c => c.href && (pathname === c.href || pathname.startsWith(c.href + '/')))) {
        s.add(item.key);
      }
    }
    s.add('staff-roles');
    return s;
  }, [navigationItems, pathname]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const isActive = (href?: string) =>
    !!href && (pathname === href || pathname.startsWith(href + '/'));

  const renderItem = (item: MenuItem) => {
    const active      = isActive(item.href);
    const childActive = item.children?.some(c => isActive(c.href)) ?? false;
    const open        = expanded.has(item.key);

    if (item.href && !item.children?.length) {
      return (
        <Link
          key={item.key}
          href={item.href}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
            active
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold border-l-2 border-blue-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{item.icon}</span>
          <span className="truncate flex-1">{item.label}</span>
        </Link>
      );
    }

    return (
      <div key={item.key} className="space-y-0.5">
        <button
          onClick={() => toggle(item.key)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
            childActive || open
              ? 'text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-700/40'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/30'
          }`}
        >
          <span className={`w-4 h-4 flex-shrink-0 flex items-center justify-center ${childActive ? 'text-blue-500' : ''}`}>
            {item.icon}
          </span>
          <span className="flex-1 truncate font-medium">{item.label}</span>
          <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform ${open ? '-rotate-180' : ''}`} />
        </button>

        {open && item.children && (
          <div className="ml-3 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
            {item.children.map(child => (
              <Link
                key={child.key}
                href={child.href || '#'}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-all ${
                  isActive(child.href)
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/40'
                }`}
              >
                <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">{child.icon}</span>
                <span className="truncate">{child.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />}

      <div className={`fixed left-0 top-0 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 md:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">D</div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">DRAIS</div>
              <div className="text-xs text-slate-500">School OS</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 custom-scroll">
          {navigationItems.length > 0
            ? navigationItems.map(item => renderItem(item))
            : <p className="text-xs text-slate-400 px-3 py-2">No modules available</p>
          }
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">Multi-tenant · DRAIS v4</div>
        </div>
      </div>
    </>
  );
};
