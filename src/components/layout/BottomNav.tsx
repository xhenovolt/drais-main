'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CalendarCheck, Menu } from 'lucide-react';

/**
 * BOTTOM NAVIGATION — One UI 8 Style — Mobile only (lg:hidden)
 *
 * Exactly 4 items:
 *  1. Dashboard  → /dashboard
 *  2. Students   → /students
 *  3. Attendance → /attendance
 *  4. More       → opens MobileDrawer (via onMoreClick callback)
 *
 * RULES:
 * - Only visible on mobile (lg:hidden)
 * - 60px height, evenly-spaced items
 * - Active item: blue pill indicator above icon
 * - Matches MobileDrawer navigation exactly via onMoreClick
 */

interface BottomNavProps {
  onMoreClick?: () => void;
}

const NAV_ITEMS = [
  { key: 'dashboard',  label: 'Dashboard',  href: '/dashboard',  Icon: LayoutDashboard },
  { key: 'students',   label: 'Students',   href: '/students',   Icon: Users },
  { key: 'attendance', label: 'Attendance', href: '/attendance', Icon: CalendarCheck },
] as const;

export const BottomNav = ({ onMoreClick }: BottomNavProps) => {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
      style={{ height: '60px' }}
    >
      {/* Frosted glass background */}
      <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200/80 dark:border-gray-700/80" />

      <div className="relative flex items-center justify-around h-full px-2">
        {/* Static nav links */}
        {NAV_ITEMS.map(({ key, label, href, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={key}
              href={href}
              className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 group relative"
            >
              {/* Active pill indicator */}
              {active && (
                <span className="absolute top-1.5 h-1 w-10 bg-blue-600 dark:bg-blue-400 rounded-full" />
              )}
              <div
                className={`flex items-center justify-center w-10 h-8 rounded-2xl transition-all duration-200 ${
                  active
                    ? 'bg-blue-100 dark:bg-blue-900/40'
                    : 'group-hover:bg-gray-100 dark:group-hover:bg-gray-800'
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors duration-200 ${
                    active
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-semibold transition-colors duration-200 ${
                  active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* More — opens full-screen drawer */}
        <button
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 group relative"
          aria-label="Open navigation menu"
        >
          <div className="flex items-center justify-center w-10 h-8 rounded-2xl transition-all duration-200 group-hover:bg-gray-100 dark:group-hover:bg-gray-800">
            <Menu className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors duration-200" />
          </div>
          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors duration-200">
            More
          </span>
        </button>
      </div>

      {/* Safe area padding for home bar (iOS) */}
      <div className="bg-white/90 dark:bg-gray-900/90 h-safe-area-inset-bottom" />
    </nav>
  );
};

export default BottomNav;
