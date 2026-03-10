"use client";
import React, { useEffect, useState } from 'react';

/**
 * SystemThemeWrapper
 * Applies system-level dark mode preference for public/auth pages.
 * Uses matchMedia to detect OS-level dark mode setting.
 */
export default function SystemThemeWrapper({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setDarkMode(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  if (!mounted) {
    // Prevent hydration mismatch
    return <div className="min-h-screen bg-white">{children}</div>;
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors">
        {children}
      </div>
    </div>
  );
}
