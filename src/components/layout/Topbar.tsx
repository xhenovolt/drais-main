'use client';

import React from 'react';
import { Menu, X, Bell, Settings } from 'lucide-react';
import Link from 'next/link';

interface TopbarProps {
  onMenuClick: () => void;
}

/**
 * TOPBAR - Mobile-First Design
 * 
 * MOBILE:
 * - Menu icon (44px) + Logo + Notification bell + Settings
 * - Simple, clean, uncluttered
 * - Single row, no wrapping
 * 
 * DESKTOP:
 * - Same layout, but sidebar visible so less emphasis on menu
 * 
 * DESIGN RULES:
 * - 56px height (standard mobile)
 * - Flex layout with space-between
 * - Touch zones: 44px minimum
 * - Sticky position
 */
export const Topbar = ({ onMenuClick }: TopbarProps) => {
  return (
    <div className="sticky top-0 z-50 h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between w-full h-full px-3 sm:px-4 md:px-6">
        {/* LEFT: Menu (mobile) + Logo */}
        <div className="flex items-center gap-3">
          {/* Menu Button - Only visible on mobile, 44px touch zone */}
          <button
            onClick={onMenuClick}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle menu"
          >
            <Menu size={24} className="text-gray-700 dark:text-gray-300" />
          </button>

          {/* Logo */}
          <Link 
            href="/"
            className="flex items-center gap-2 font-bold text-lg text-gray-900 dark:text-white"
          >
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm">
              D
            </div>
            <span className="hidden sm:inline">DRAIS</span>
          </Link>
        </div>

        {/* RIGHT: Notifications + Settings */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Notification Bell - 44px touch zone */}
          <button 
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell size={20} className="text-gray-700 dark:text-gray-300" />
            {/* Notification badge */}
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* Settings - 44px touch zone */}
          <Link 
            href="/settings"
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Settings"
          >
            <Settings size={20} className="text-gray-700 dark:text-gray-300" />
          </Link>
        </div>
      </div>
    </div>
  );
};
