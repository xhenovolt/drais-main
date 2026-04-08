"use client";
import React, { createContext, useContext, useEffect } from "react";
import { useThemeStore } from "@/hooks/useThemeStore";
import clsx from "clsx";

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

  // Apply theme vars to html only after hydration
  useEffect(() => {
    if (!hydrated) return;
    
    const root = document.documentElement;

    // Tailwind dark mode requires class="dark" on <html> (darkMode: 'class' in tailwind.config)
    if (store.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    root.dataset.themeMode = store.mode;
    root.style.setProperty("--color-primary", store.primary);
    root.style.setProperty("--gradient-from", store.gradientFrom);
    root.style.setProperty("--gradient-to", store.gradientTo);
    root.style.setProperty("--font-scale", store.fontScale.toString());
    root.style.setProperty("--glass-blur", store.glass ? "12px" : "0px");
    root.style.setProperty("--glass-bg", store.glass ? "hsla(0,0%,100%,0.15)" : "transparent");
    root.style.setProperty("--glass-border", store.glass ? "1px solid rgba(255,255,255,0.2)" : "none");
    if (store.fontFamily) root.style.setProperty('--app-font-family', store.fontFamily);
    // Border radius from appearance settings
    const br = (store as any).borderRadius || 'lg';
    const brMap: Record<string, string> = { none: '0px', sm: '2px', md: '6px', lg: '8px', full: '9999px' };
    root.style.setProperty('--app-border-radius', brMap[br] || '8px');
  }, [hydrated, store.mode, store.primary, store.gradientFrom, store.gradientTo, store.fontScale, store.glass, store.fontFamily]);

  const value: ThemeContextValue = {
    mode: store.mode,
    primary: store.primary,
    gradientFrom: store.gradientFrom,
    gradientTo: store.gradientTo,
    glass: store.glass,
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
      <div className={clsx(
        "min-h-screen w-full bg-gradient-to-br transition-colors duration-500",
        store.mode === "light" ? "from-gray-50 to-blue-100" : "from-gray-950 to-blue-950",
        "text-[length:calc(1rem*var(--font-scale))]",
        hydrated && store.layoutWidth === 'boxed' && 'mx-auto max-w-7xl shadow-lg',
        hydrated && store.layoutWidth === 'wide' && 'mx-auto max-w-[1800px]',
        hydrated && store.fontFamily && 'font-sans'
      )} 
      style={hydrated ? { fontFamily: 'var(--app-font-family)' } : undefined}>
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
