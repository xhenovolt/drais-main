'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, User, Smartphone } from 'lucide-react';

/**
 * PROFESSIONAL USER PROFILE DROPDOWN
 * 
 * FEATURES:
 * - Circular avatar with initials
 * - User info section (name, email, role)
 * - Quick links: Profile, Settings, Sessions
 * - Logout with visual separation
 * - Keyboard accessible
 * - Closes on outside click
 * - Smooth animations
 */

export const ProfileDropdown: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Get user role display
  const roleDisplay = Array.isArray(user.roles) && user.roles.length > 0
    ? typeof user.roles[0] === 'string'
      ? user.roles[0].toUpperCase()
      : user.roles[0].name
    : 'User';

  // Get initials
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="relative" ref={menuRef}>
      {/* Profile Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="User profile menu"
        aria-expanded={isOpen}
      >
        {/* Avatar Circle */}
        <div className="w-9 h-9 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full flex items-center justify-center font-semibold text-sm shadow-sm border border-blue-400 border-opacity-50">
          {initials}
        </div>

        {/* Show name on desktop, hide on mobile */}
        <span className="hidden sm:inline text-sm font-medium text-gray-900 dark:text-white max-w-[120px] truncate">
          {user.firstName}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 shadow-2xl rounded-xl border border-gray-200 dark:border-gray-700 py-0 z-50 animate-in fade-in slide-in-from-top-2 origin-top-right"
          role="menu"
          aria-orientation="vertical"
        >
          {/* ─── TOP SECTION: USER INFO ─── */}
          <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700">
            {/* Avatar + Name + Role */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white truncate">
                  {user.displayName}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user.email}
                </div>
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-1">
                  {roleDisplay}
                </div>
              </div>
            </div>

            {/* School Info */}
            {user.schoolName && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">School</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.schoolName}
                </div>
              </div>
            )}
          </div>

          {/* ─── MIDDLE SECTION: QUICK LINKS ─── */}
          <div className="py-2">
            <Link
              href="/profile"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <User size={16} className="text-gray-400 dark:text-gray-500" />
              <span>Profile</span>
            </Link>

            <Link
              href="/settings"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <Settings size={16} className="text-gray-400 dark:text-gray-500" />
              <span>Settings</span>
            </Link>

            <Link
              href="/sessions"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <Smartphone size={16} className="text-gray-400 dark:text-gray-500" />
              <span>Sessions & Devices</span>
            </Link>
          </div>

          {/* ─── DIVIDER ─── */}
          <div className="border-t border-gray-100 dark:border-gray-700"></div>

          {/* ─── BOTTOM: LOGOUT ─── */}
          <div className="p-2">
            <button
              onClick={() => {
                setIsOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              role="menuitem"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
