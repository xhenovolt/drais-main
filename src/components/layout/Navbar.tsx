"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Bell, Search, Menu, User, Globe, Sun, Moon, Settings, ChevronDown, Check, Loader, LogOut, HelpCircle } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useThemeStore } from '@/hooks/useThemeStore';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import BellClient from '@/components/notifications/BellClient';
import NavbarSearch from './NavbarSearch';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/api';
const fetcher = (url: string) => fetch(url).then(r => r.json());

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const theme = useTheme();
  const store = useThemeStore();
  const { t, lang, setLang, dir } = useI18n();
  const { user, logout, isAuthenticated } = useAuth();
  const { setHelpSearchOpen, startTour } = useOnboarding();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Get school name from authenticated user's school data
  const schoolName = user?.school?.name || user?.schoolName || 'School';

  // Language options
  const languages = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' }
  ];

  // Close language dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    };

    if (languageOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [languageOpen]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

  const handleLanguageChange = (langCode: string) => {
    setLang(langCode);
    setLanguageOpen(false);
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user) return 'U';
    const first = user.firstName?.charAt(0) || '';
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U';
  };

  // Get display name
  const getDisplayName = () => {
    if (!user) return 'User';
    return user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User';
  };

  // Hide navbar on the reports page
  if (pathname === '/academics/reports') {
    return null;
  }

  const navbarStyle = store.navbarStyle;
  const isRTL = dir === 'rtl';

  const navbarClasses = clsx(
    "fixed top-0 z-40 w-full transition-all duration-300",
    navbarStyle === 'glass' && "backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-white/20 dark:border-white/10",
    navbarStyle === 'solid' && "bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-gray-800 shadow-sm",
    navbarStyle === 'transparent' && "bg-transparent"
  );

  // Enhanced hamburger toggle function
  const handleToggleSidebar = () => {
    // Dispatch custom event for mobile sidebar
    window.dispatchEvent(new CustomEvent('toggleSidebar'));
    // Also call the original onToggleSidebar for desktop if needed
    onToggleSidebar();
  };

  return (
    <nav className={navbarClasses} style={{ height: '4rem' }}>
      <div className="h-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-full">
          {/* Left Section */}
          <div className="flex items-center space-x-4 rtl:space-x-reverse">
            {/* Enhanced Hamburger Menu - Now works for both mobile and desktop */}
            <button
              id="hamburger-button"
              onClick={handleToggleSidebar}
              className={clsx(
                "p-2 rounded-lg transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50",
                "group relative"
              )}
              aria-label="Toggle sidebar"
            >
              <div className="relative w-5 h-5">
                <motion.span
                  className="absolute top-0 left-0 w-5 h-0.5 bg-current transform transition-all duration-200 group-hover:bg-blue-500"
                  style={{ transformOrigin: "center" }}
                />
                <motion.span
                  className="absolute top-2 left-0 w-5 h-0.5 bg-current transform transition-all duration-200 group-hover:bg-blue-500"
                  style={{ transformOrigin: "center" }}
                />
                <motion.span
                  className="absolute bottom-0 left-0 w-5 h-0.5 bg-current transform transition-all duration-200 group-hover:bg-blue-500"
                  style={{ transformOrigin: "center" }}
                />
              </div>
              
              {/* Subtle hover effect */}
              <div className="absolute inset-0 rounded-lg bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            </button>

            {/* Logo/Brand with School Name */}
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <div className="hidden sm:flex flex-col">
                <h1 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  School
                </h1>
                <h2 className="text-sm font-bold bg-gradient-to-r from-[var(--color-primary)] to-purple-600 bg-clip-text text-transparent max-w-xs truncate" title={schoolName}>
                  {schoolName}
                </h2>
              </div>
              <div className="sm:hidden">
                <h1 className="text-xl font-bold bg-gradient-to-r from-[var(--color-primary)] to-purple-600 bg-clip-text text-transparent">
                  DRAIS
                </h1>
              </div>
            </div>
          </div>

          {/* Center Section - Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <NavbarSearch />
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            {/* Mobile Search */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Language Switcher Dropdown */}
            <div className="relative" ref={languageDropdownRef}>
              <button
                onClick={() => setLanguageOpen(!languageOpen)}
                className="flex items-center space-x-2 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all group"
                aria-label="Switch language"
              >
                <Globe className="w-4 h-4 text-gray-600 dark:text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
                <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-[var(--color-primary)] transition-colors">
                  {languages.find(l => l.code === lang)?.nativeName || lang.toUpperCase()}
                </span>
                <span className="sm:hidden text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-[var(--color-primary)] transition-colors">
                  {lang.toUpperCase()}
                </span>
                <ChevronDown className={clsx(
                  "w-4 h-4 text-gray-600 dark:text-gray-300 transition-transform duration-200",
                  languageOpen && "rotate-180"
                )} />
              </button>

              <AnimatePresence>
                {languageOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className={clsx(
                      "absolute top-full mt-2 w-48 rounded-xl shadow-lg border",
                      "bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700",
                      "overflow-hidden z-50",
                      isRTL ? "left-0" : "right-0"
                    )}
                  >
                    <div className="py-1">
                      {languages.map((language) => (
                        <button
                          key={language.code}
                          onClick={() => handleLanguageChange(language.code)}
                          className={clsx(
                            "w-full flex items-center justify-between px-4 py-2.5 transition-colors",
                            "hover:bg-gray-100 dark:hover:bg-slate-700",
                            lang === language.code 
                              ? "bg-blue-50 dark:bg-blue-900/20 text-[var(--color-primary)]" 
                              : "text-gray-700 dark:text-gray-200"
                          )}
                        >
                          <div className="flex items-center space-x-3 rtl:space-x-reverse">
                            <span className="text-xl">{language.flag}</span>
                            <div className="text-left rtl:text-right">
                              <div className={clsx(
                                "text-sm font-medium",
                                lang === language.code && "text-[var(--color-primary)]"
                              )}>
                                {language.nativeName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {language.name}
                              </div>
                            </div>
                          </div>
                          {lang === language.code && (
                            <Check className="w-4 h-4 text-[var(--color-primary)]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={() => theme.setMode(theme.mode === 'light' ? 'dark' : 'light')}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-label="Toggle theme"
            >
              {theme.mode === 'light' ? (
                <Moon className="w-5 h-5 text-gray-600 hover:text-[var(--color-primary)] transition-colors" />
              ) : (
                <Sun className="w-5 h-5 text-gray-300 hover:text-yellow-400 transition-colors" />
              )}
            </button>

            {/* Notifications - Replace the old bell with BellClient */}
            <BellClient 
              userId={user?.id || 0}
              schoolId={user?.schoolId || 0}
              className="relative"
            />

            {/* Theme Customizer Toggle */}
            <button
              onClick={() => store.toggleCustomizer?.()}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-label="Theme settings"
            >
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-[var(--color-primary)] transition-colors" />
            </button>

            {/* Help Button — opens help search or navigates to /help */}
            <div className="relative group">
              <button
                onClick={() => setHelpSearchOpen(true)}
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Help"
              >
                <HelpCircle className="w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-indigo-500 transition-colors" />
              </button>
              {/* Quick tooltip */}
              <div className="absolute right-0 top-full mt-1 w-36 hidden group-hover:block z-50">
                <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                  Help &amp; Tour
                  <div className="text-gray-400 text-xs mt-0.5">⌘⇧H to search</div>
                </div>
              </div>
            </div>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center space-x-3 rtl:space-x-reverse p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Profile menu"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    getUserInitials()
                  )}
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-200 max-w-[120px] truncate">
                  {getDisplayName()}
                </span>
                <ChevronDown className={clsx(
                  "hidden sm:block w-4 h-4 text-gray-500 transition-transform duration-200",
                  profileOpen && "rotate-180"
                )} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className={clsx(
                      "absolute top-full mt-2 w-64 rounded-xl shadow-lg border",
                      "bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700",
                      isRTL ? "left-0" : "right-0"
                    )}
                  >
                    {/* User Info Header */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center space-x-3 rtl:space-x-reverse">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-purple-600 flex items-center justify-center text-white font-semibold">
                          {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            getUserInitials()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {getDisplayName()}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {user?.email}
                          </p>
                        </div>
                      </div>
                      {user?.schoolName && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 truncate">
                          {user.schoolName}
                        </p>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="p-2">
                      <a
                        href="/settings/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                      >
                        <User className="w-4 h-4" />
                        <span className="text-sm">{t('navigation.profile')}</span>
                      </a>
                      <a
                        href="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-sm">{t('navigation.settings')}</span>
                      </a>
                      <a
                        href="/help"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                      >
                        <HelpCircle className="w-4 h-4" />
                        <span className="text-sm">Help Center</span>
                      </a>
                      <button
                        onClick={() => { setProfileOpen(false); startTour(); }}
                        className="w-full flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 transition-colors"
                      >
                        <span className="text-sm">🚀</span>
                        <span className="text-sm">Restart Guided Tour</span>
                      </button>
                      <hr className="my-2 border-gray-200 dark:border-gray-600" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm">{t('navigation.logout')}</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Mobile Search Overlay */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
            >
              <div className="p-4">
                <NavbarSearch isMobile={true} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};

export default Navbar;
