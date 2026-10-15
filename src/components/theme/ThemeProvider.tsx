"use client";
import React, { createContext, useContext, useEffect } from "react";
import { useThemeStore } from "@/hooks/useThemeStore";
import clsx from "clsx";
import { effectiveTheme, applyThemeToDocument } from "@/lib/theme/apply";

interface ThemeContextValue {
  mode: string;
  primary: string;
  gradientFrom: string;
  gradientTo: string;
  glass: boolean;
  fontScale: number;
  sidebarCollapsed: boolean;
  setMode: (m: string) => void;
  setPrimary: (c: string) => void;
  setGradient: (from: string, to: string) => void;
  toggleGlass: () => void;
  setFontScale: (n: number) => void;
  toggleSidebar: () => void;
  resetTheme?: () => void;
  sidebarPosition?: 'left' | 'right';
  iconScale?: number;
  language?: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useThemeStore();
  const hydrated = useThemeStore(state => state.hydrated);
  const syncSystemMode = useThemeStore(state => state.syncSystemMode);

  // Follow the OS while themePreference === 'system': re-resolve on change.
  useEffect(() => {
    if (!hydrated || store.themePreference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    syncSystemMode(); // resolve immediately
    const onChange = () => syncSystemMode();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hydrated, store.themePreference, syncSystemMode]);

  // The EFFECTIVE theme: personal choices where made, else the school's branding,
  // else the DRAIS default. Applied as CSS variables on <html> — the palette and
  // radius variables every Tailwind utility reads — so it reaches every screen.
  const eff = effectiveTheme(store, store.school, store.mode === 'dark');

  useEffect(() => {
    if (!hydrated) return;
    // The settings preview page shows a DRAFT theme sent by its parent page — leave it alone.
    if (window.location.pathname.startsWith('/theme-preview')) return;
    const root = document.documentElement;
    // Tailwind dark mode is bound to `.dark` via @custom-variant in globals.css.
    root.classList.toggle('dark', store.mode === 'dark');
    root.dataset.themeMode = store.mode;
    root.style.setProperty("--gradient-from", store.gradientFrom);
    root.style.setProperty("--gradient-to", store.gradientTo);
    applyThemeToDocument(eff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, store.mode, store.primary, store.primaryExplicit, store.glassMode, store.radius, store.font,
      store.fontScale, store.school, store.gradientFrom, store.gradientTo]);

  const value: ThemeContextValue = {
    mode: store.mode,
    primary: store.primary,
    gradientFrom: store.gradientFrom,
    gradientTo: store.gradientTo,
    glass: eff.glass,
    fontScale: store.fontScale,
    sidebarCollapsed: store.sidebarCollapsed,
    setMode: store.setMode,
    setPrimary: store.setPrimary,
    setGradient: store.setGradient,
    toggleGlass: store.toggleGlass,
    setFontScale: store.setFontScale,
    toggleSidebar: store.toggleSidebar,
    resetTheme: (store as any).resetTheme,
    sidebarPosition: (store as any).sidebarPosition,
    iconScale: (store as any).iconScale,
    language: (store as any).language
  };

  return (
    <ThemeContext.Provider value={value}>
      {/* Font family and text size are applied on <html> (applyThemeToDocument): text
          sizes are rem, so a wrapper could never scale them. */}
      <div className={clsx(
        "min-h-screen w-full bg-gradient-to-br transition-colors duration-500",
        store.mode === "light" ? "from-gray-50 to-blue-100" : "from-gray-950 to-blue-950",
        hydrated && store.layoutWidth === 'boxed' && 'mx-auto max-w-7xl shadow-lg',
        hydrated && store.layoutWidth === 'wide' && 'mx-auto max-w-[1800px]',
      )}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
