'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X, ChevronDown, Globe, Sun, Moon, Settings, HelpCircle,
  LogOut, User, Bell, Search, Check,
} from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getNavigationItems, MenuItem, filterMenuByRole } from '@/lib/navigationConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import BellClient from '@/components/notifications/BellClient';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'en', name: 'English',  nativeName: 'English',  flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic',   nativeName: 'العربية',  flag: '🇸🇦' },
];

export const MobileDrawer = ({ isOpen, onClose }: MobileDrawerProps) => {
  const pathname = usePathname();
  const { t, lang, setLang }   = useI18n();
  const { user, logout }       = useAuth() || {};
  const theme                  = useTheme();
  const { school }             = useSchoolConfig();
  const [langOpen, setLangOpen] = useState(false);

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
    if (next.has(key)) { next.delete(key); } else { next.add(key); }
    return next;
  });

  useEffect(() => { onClose(); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const isActive = (href?: string) =>
    !!href && (pathname === href || pathname.startsWith(href + '/'));

  const getUserInitials = () => {
    if (!user) return 'U';
    const first = user.firstName?.charAt(0) || '';
    const last  = user.lastName?.charAt(0)  || '';
    return (first + last).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U';
  };

  const getDisplayName = () => {
    if (!user) return 'User';
    return user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User';
  };

  const handleLogout = async () => {
    onClose();
    await logout?.();
  };

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
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}

      <div className={`fixed left-0 top-0 h-full w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* ── User Profile Header ── */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  : getUserInitials()
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{getDisplayName()}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* School name */}
          {(school?.name || user?.schoolName) && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
              <div className="w-5 h-5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">D</div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                {school?.name || user?.schoolName}
              </span>
            </div>
          )}

          {/* Quick action row: search, notifications, theme, language */}
          <div className="flex items-center gap-1 mt-3">
            <Link
              href="/search"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs"
            >
              <Search className="w-3.5 h-3.5" />
              Search
            </Link>

            <div className="flex items-center gap-1">
              {/* Notifications */}
              <BellClient
                userId={user?.id || 0}
                schoolId={user?.schoolId || 0}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              />

              {/* Theme toggle */}
              <button
                onClick={() => theme.setMode(theme.mode === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                aria-label="Toggle theme"
              >
                {theme.mode === 'light'
                  ? <Moon className="w-4 h-4" />
                  : <Sun className="w-4 h-4" />
                }
              </button>

              {/* Language switcher */}
              <div className="relative">
                <button
                  onClick={() => setLangOpen(v => !v)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                  aria-label="Language"
                >
                  <Globe className="w-4 h-4" />
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                    {LANGUAGES.map(l => (
                      <button
                        key={l.code}
                        onClick={() => { setLang(l.code); setLangOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${
                          lang === l.code ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{l.flag}</span>
                          <span>{l.nativeName}</span>
                        </span>
                        {lang === l.code && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 custom-scroll">
          {navigationItems.length > 0
            ? navigationItems.map(item => renderItem(item))
            : <p className="text-xs text-slate-400 px-3 py-2">No modules available</p>
          }
        </nav>

        {/* ── Footer: profile links + logout ── */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-2 space-y-0.5">
          <Link
            href="/settings/profile"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <User className="w-4 h-4" />
            My Profile
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <Link
            href="/help"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            Help & Support
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
};
