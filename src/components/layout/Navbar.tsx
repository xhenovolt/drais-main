"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Bell, Search, Menu, User, Globe, Sun, Moon, Settings, ChevronDown, Check, Loader } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useThemeStore } from '@/hooks/useThemeStore';
import { useI18n } from '@/components/i18n/I18nProvider';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import BellClient from '@/components/notifications/BellClient';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/api';
const fetcher = (url: string) => fetch(url).then(r => r.json());

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const theme = useTheme();
  const store = useThemeStore();
  const { t, lang, setLang, dir } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Fetch school info
  const { data: schoolData } = useSWR(
    `${API_BASE}/school-info`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const schoolName = schoolData?.data?.school_name || 'Ibun Baz Girls Secondary School';

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

  const handleLanguageChange = (langCode: string) => {
    setLang(langCode);
    setLanguageOpen(false);
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
            <div className="relative w-full">
              <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('common.search')}
                className="w-full pl-10 rtl:pl-4 rtl:pr-10 pr-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-[var(--color-primary)] focus:bg-white dark:focus:bg-slate-700 transition-all placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>
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
              userId={1} // TODO: Get from session
              schoolId={1} // TODO: Get from session
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

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center space-x-3 rtl:space-x-reverse p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Profile menu"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-purple-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Admin
                </span>
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className={clsx(
                      "absolute top-full mt-2 w-48 rounded-xl shadow-lg border",
                      "bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700",
                      isRTL ? "left-0" : "right-0"
                    )}
                  >
                    <div className="p-2">
                      <a
                        href="#"
                        className="flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <User className="w-4 h-4" />
                        <span className="text-sm">{t('navigation.profile')}</span>
                      </a>
                      <a
                        href="#"
                        className="flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-sm">{t('navigation.settings')}</span>
                      </a>
                      <hr className="my-2 border-gray-200 dark:border-gray-600" />
                      <a
                        href="#"
                        className="flex items-center space-x-3 rtl:space-x-reverse px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                      >
                        <span className="text-sm">{t('navigation.logout')}</span>
                      </a>
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
                <div className="relative">
                  <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('common.search')}
                    className="w-full pl-10 rtl:pl-4 rtl:pr-10 pr-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
                    autoFocus
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};

export default Navbar;
