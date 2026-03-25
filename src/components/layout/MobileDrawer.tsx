'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ChevronRight } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { getNavigationItems, MenuItem, filterMenuByRole } from '@/lib/navigationConfig';
import { useAuth } from '@/contexts/AuthContext';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * MOBILE DRAWER - Sidebar substitute for mobile
 * 
 * ⚡ INTELLIGENT NAVIGATION SYSTEM
 * - Dynamically loads ALL routes from navigationConfig
 * - Supports collapsible groups on mobile
 * - Does NOT hard-code any routes
 * - Respects user role permissions
 * 
 * DESIGN:
 * - Slides in from left
 * - Overlay backdrop
 * - Close button
 * - Full-height navigation with sections
 * - Collapsible groups for organization
 * 
 * RULES:
 * - Only visible on mobile (when isOpen=true)
 * - Closes on link click
 * - Overlay dismissible
 * - Auto-expands critical modules
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MobileDrawer = ({ isOpen, onClose }: MobileDrawerProps) => {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user } = useAuth() || {};

  // Get navigation items and filter by role
  const navigationItems = useMemo(() => {
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

  // Auto-expand critical modules
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['attendance', 'students', 'academics', 'reports'])
  );

  const toggleSection = (key: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSections(newExpanded);
  };

  useEffect(() => {
    // Close drawer when route changes
    onClose();
  }, [pathname, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Render a single menu item (with optional children)
  const renderMenuItem = (item: MenuItem) => {
    return (
      <div key={item.key} className="relative">
        {/* Main nav item */}
        {item.href ? (
          // If item has href, render as clickable link
          <Link
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              isActive(item.href)
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
              {item.icon}
            </div>
            <span className="text-sm font-medium flex-1">{item.label}</span>
            {item.children && item.children.length > 0 && (
              <ChevronRight
                size={18}
                className={`flex-shrink-0 transition-transform ${
                  expandedSections.has(item.key) ? 'rotate-90' : ''
                }`}
              />
            )}
          </Link>
        ) : (
          // If no href, render as group toggle button
          <button
            onClick={() => toggleSection(item.key)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left ${
              expandedSections.has(item.key) ||
              (item.children?.some((child) => isActive(child.href)) ?? false)
                ? 'bg-gray-50 dark:bg-gray-700'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex items-center gap-3 flex-1">
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {item.label}
              </span>
            </span>
            {item.children && item.children.length > 0 && (
              <ChevronRight
                size={18}
                className={`flex-shrink-0 transition-transform text-gray-400 ${
                  expandedSections.has(item.key) ? 'rotate-90' : ''
                }`}
              />
            )}
          </button>
        )}

        {/* Submenu - Show if expanded */}
        {item.children && item.children.length > 0 && expandedSections.has(item.key) && (
          <div className="ml-2 mt-1 space-y-1 border-l-2 border-gray-200 dark:border-gray-700 pl-2">
            {item.children.map((child) => (
              <Link
                key={child.key}
                href={child.href || '#'}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive(child.href)
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
              >
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {child.icon}
                </div>
                <span>{child.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              D
            </div>
            <div>
              <div className="font-bold text-gray-900 dark:text-white">DRAIS</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">School OS</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Navigation - Scrollable */}
        <nav className="px-2 py-4 space-y-1 overflow-y-auto flex-1 custom-scroll">
          {navigationItems.length > 0 ? (
            navigationItems.map((item) => renderMenuItem(item))
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2">
              No modules available
            </div>
          )}
        </nav>

        {/* Drawer Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <div className="font-semibold text-gray-900 dark:text-white">DRAIS</div>
            <div>School Management System</div>
          </div>
        </div>
      </div>
    </>
  );
};
