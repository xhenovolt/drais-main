'use client';

import React from 'react';
import { Menu, Bell } from 'lucide-react';
import Link from 'next/link';
import { SearchBar } from '@/components/ui/SearchBar';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

interface TopbarProps {
  onMenuClick: () => void;
}

/**
 * TOPBAR - Professional Header with Search & Profile
 * 
 * DESKTOP LAYOUT:
 * - Left: Menu (hidden lg+) + Logo
 * - Center: Global Search Bar
 * - Right: Notifications + Profile Dropdown
 * 
 * MOBILE LAYOUT:
 * - Left: Menu icon + Logo
 * - Center: Search icon (opens modal)
 * - Right: Profile circle (compact)
 * 
 * DESIGN RULES:
 * - 56px height
 * - Visible simplicity, hidden power
 * - One-click access to everything powerful
 * - Touch zones: 44px minimum
 * - No clutter
 */
export const Topbar = ({ onMenuClick }: TopbarProps) => {
  return (
    <div className="sticky top-0 z-50 h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between w-full h-full px-3 sm:px-4 lg:px-6 gap-4">
        {/* LEFT: Menu (mobile) + Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Menu Button - Only visible on mobile, 44px touch zone */}
          <button
            onClick={onMenuClick}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Toggle menu"
          >
            <Menu size={24} className="text-gray-700 dark:text-gray-300" />
          </button>

          {/* Logo */}
          <Link 
            href="/"
            className="flex items-center gap-2 font-bold text-lg text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-md">
              D
            </div>
            <span className="hidden sm:inline">DRAIS</span>
          </Link>
        </div>

        {/* CENTER: Global Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md">
          <SearchBar isMobile={false} />
        </div>

        {/* RIGHT: Icons + Profile */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mobile Search Icon */}
          <div className="md:hidden">
            <SearchBar isMobile={true} />
          </div>

          {/* Notification Bell - 44px touch zone */}
          <button 
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 relative"
            aria-label="Notifications"
          >
            <Bell size={20} className="text-gray-700 dark:text-gray-300" />
            {/* Notification badge */}
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          </button>

          {/* Profile Dropdown */}
          <ProfileDropdown />
        </div>
      </div>
    </div>
  );
};
