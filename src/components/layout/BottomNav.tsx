'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getNavigationItems, filterMenuByRole } from '@/lib/navigationConfig';
import { useAuth } from '@/contexts/AuthContext';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * BOTTOM NAVIGATION - Mobile Only
 * 
 * ⚡ PRIORITY MODULES SYSTEM
 * - Shows top 5 critical modules on mobile
 * - Priority order: Dashboard, Students, Attendance, Academics, Settings
 * - Dynamically loaded from navigationConfig
 * - Respects user role permissions
 * 
 * DESIGN:
 * - Fixed at bottom of screen
 * - 5 main sections
 * - Icon + Label
 * - Active indicator (underline)
 * 
 * RULES:
 * - Hidden on desktop (lg breakpoint)
 * - Always visible on mobile
 * - 44px+ touch zones
 * - Simple, uncluttered
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const BottomNav = () => {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user } = useAuth() || {};

  // Get all navigation items
  const allItems = useMemo(() => {
    // Wrapper function to adapt t's signature
    const tWrapper = (key: string, fallback?: string) => {
      return t(key) || fallback || key;
    };
    const items = getNavigationItems(tWrapper);
    
    // Filter by role if user info is available
    if (user) {
      const hasRole = (slug: string) => {
        if (!user.roles) return false;
        if (typeof user.roles[0] === 'string') {
          return (user.roles as string[]).includes(slug);
        }
        return (user.roles as any[]).some((role: any) => role.slug === slug);
      };
      const isSuperAdmin = user.isSuperAdmin === true;
      return filterMenuByRole(items, hasRole, isSuperAdmin);
    }
    
    return items;
  }, [t, user]);

  // Extract top 5 priority modules: Dashboard, Students, Attendance, Academics, Settings
  const priorityOrder = ['dashboard', 'students', 'attendance', 'academics', 'settings'];
  const navItems = useMemo(() => {
    const prioritized = priorityOrder
      .map(key => allItems.find(item => item.key === key))
      .filter((item): item is typeof allItems[0] => item !== undefined && item.href !== undefined)
      .slice(0, 5);

    // If we don't have 5 items, add more from the remaining items
    if (prioritized.length < 5) {
      const remaining = allItems.filter(
        item => item.href && !prioritized.some(p => p.key === item.key)
      );
      prioritized.push(...remaining.slice(0, 5 - prioritized.length));
    }

    return prioritized;
  }, [allItems]);

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="fixed lg:hidden bottom-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40">
      <div className="flex items-center justify-around h-full px-1">
        {navItems.length > 0 ? (
          navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href || '#'}
              className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative ${
                isActive(item.href)
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title={item.label}
            >
              <div className="w-6 h-6 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="text-xs font-medium truncate max-w-12">
                {item.label}
              </span>
              {/* Active indicator */}
              {isActive(item.href) && (
                <div className="absolute bottom-0 h-1 w-12 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
              )}
            </Link>
          ))
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            No modules
          </div>
        )}
      </div>
    </nav>
  );
};
