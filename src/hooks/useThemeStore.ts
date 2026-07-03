"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Resolve the OS colour-scheme preference (SSR-safe). */
export function resolveSystemMode(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeState {
  /**
   * RESOLVED theme actually applied to the document ("light" | "dark").
   * Everything in the app reads this. When themePreference is "system" it
   * tracks the OS setting live.
   */
  mode: "light" | "dark";
  /**
   * The user's CHOICE: light, dark, or follow-system. Persisted. `mode` is
   * derived from this (identity for light/dark, OS-resolved for system).
   */
  themePreference: "light" | "dark" | "system";
  primary: string;
  /**
   * Has the user explicitly picked a personal brand colour? Only then does the
   * ThemeProvider override the token — otherwise the SCHOOL branding (or the
   * DRAIS default) shows through. Prevents the default primary from silently
   * clobbering a school's chosen colour for users who never customised.
   */
  primaryExplicit: boolean;
  gradientFrom: string;
  gradientTo: string;
  glass: boolean;
  fontScale: number;
  sidebarCollapsed: boolean;
  sidebarPosition: "left" | "right";
  iconScale: number;
  language: "en" | "ar";
  /**
   * Phase 6 — has the user (or anything other than the school default
   * hydrator) explicitly set the language at least once? When false, the
   * I18nProvider is allowed to apply schools.default_locale on first
   * sign-in. When true, the user's choice always wins.
   */
  languageExplicit: boolean;
  fontFamily?: string;
  layoutWidth?: "full" | "boxed" | "wide";
  navbarStyle?: "solid" | "glass" | "transparent";
  sidebarSurface?: "glass" | "solid";
  customizerPlacement?: "float" | "navbar" | "sidebar";
  customizerOpen?: boolean;
  customizerPosX?: number;
  customizerPosY?: number;
  hydrated: boolean;
  /** Set light|dark|system. "system" resolves `mode` from the OS now and the
   *  provider keeps it in sync on OS changes. */
  setMode: (m: string) => void;
  /** Re-resolve `mode` from the OS — called by the provider on matchMedia
   *  change while themePreference === "system". */
  syncSystemMode: () => void;
  toggleMode: () => void;
  setPrimary: (c: string) => void;
  setGradient: (f: string, t: string) => void;
  toggleGlass: () => void;
  setFontScale: (n: number) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setLanguage: (lng: string) => void;
  /**
   * Phase 6 — set the language WITHOUT marking it as a user-explicit
   * choice. Used by the I18nProvider to hydrate from
   * schools.default_locale on first sign-in. Calling setLanguage()
   * directly always flips the explicit flag to true.
   */
  setLanguageFromSchoolDefault: (lng: "en" | "ar") => void;
  setSidebarPosition: (pos: "left" | "right") => void;
  setIconScale: (n: number) => void;
  setFontFamily?: (f: string) => void;
  setLayoutWidth?: (w: "full" | "boxed" | "wide") => void;
  setNavbarStyle?: (v: "solid" | "glass" | "transparent") => void;
  setSidebarSurface?: (v: "glass" | "solid") => void;
  setCustomizerPlacement?: (p: "float" | "navbar" | "sidebar") => void;
  toggleCustomizer?: () => void;
  setCustomizerPosition?: (x: number, y: number) => void;
  setHydrated: (hydrated: boolean) => void;
  resetTheme: () => void;
}

const defaultState = {
  mode: "light" as const,
  themePreference: "system" as const,
  primary: "#2563eb",
  primaryExplicit: false,
  gradientFrom: "#2563eb",
  gradientTo: "#7c3aed",
  glass: false,
  fontScale: 1,
  sidebarCollapsed: true,
  language: "en" as const,
  languageExplicit: false,
  sidebarPosition: "left" as const,
  iconScale: 1,
  layoutWidth: "full" as const,
  navbarStyle: "glass" as const,
  sidebarSurface: "glass" as const,
  fontFamily: "Inter, system-ui, Segoe UI, Arial, sans-serif",
  customizerPlacement: "float" as const,
  customizerOpen: false,
  customizerPosX: 0,
  customizerPosY: 0,
  hydrated: false,
};

const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      ...defaultState,

      setMode: (m) => {
        if (m === "system") {
          set({ themePreference: "system", mode: resolveSystemMode() });
        } else {
          const resolved: "light" | "dark" = m === "dark" ? "dark" : "light";
          set({ themePreference: resolved, mode: resolved });
        }
      },
      syncSystemMode: () => {
        if (get().themePreference === "system") set({ mode: resolveSystemMode() });
      },
      toggleMode: () =>
        set((s) => {
          const next = s.mode === "light" ? "dark" : "light";
          return {
            mode: next,
            themePreference: next,
            gradientFrom: next === "dark" ? "#0f172a" : "#f9fafb",
            gradientTo: next === "dark" ? "#172554" : "#dbeafe",
          };
        }),
      setPrimary: (c) => set({ primary: c, primaryExplicit: true }),
      setGradient: (f, t) => set({ gradientFrom: f, gradientTo: t }),
      toggleGlass: () => set((s) => ({ glass: !s.glass })),
      setFontScale: (n) => set({ fontScale: n }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setLanguage: (lng) => {
        // User-explicit set — wins over school default forever after.
        const norm: 'en' | 'ar' = lng === 'ar' ? 'ar' : 'en';
        set({ language: norm, languageExplicit: true });
        // Update document direction
        if (typeof document !== "undefined") {
          document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
          document.documentElement.lang = lng;
        }
        // Set cookie for server-side rendering
        if (typeof document !== "undefined") {
          document.cookie = `lang=${lng}; path=/; max-age=31536000; SameSite=Strict`;
        }
      },
      setLanguageFromSchoolDefault: (lng) => {
        // School-default hydrator path. Does NOT flip languageExplicit,
        // so the next time the user opens the app on a different device
        // (where localStorage is empty) the school default can apply
        // again. Once they click the Topbar toggle, setLanguage above
        // takes over and the flag is sticky.
        set({ language: lng });
        if (typeof document !== "undefined") {
          document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
          document.documentElement.lang = lng;
          document.cookie = `lang=${lng}; path=/; max-age=31536000; SameSite=Strict`;
        }
      },
      setSidebarPosition: (pos) => set({ sidebarPosition: pos }),
      setIconScale: (n) => set({ iconScale: n }),
      setFontFamily: (f) => set({ fontFamily: f }),
      setLayoutWidth: (w) => set({ layoutWidth: w }),
      setNavbarStyle: (v) => set({ navbarStyle: v }),
      setSidebarSurface: (v) => set({ sidebarSurface: v }),
      setCustomizerPlacement: (p) => set({ customizerPlacement: p }),
      toggleCustomizer: () => set((s) => ({ customizerOpen: !s.customizerOpen })),
      setCustomizerPosition: (x, y) => set({ customizerPosX: x, customizerPosY: y }),
      setHydrated: (hydrated: boolean) => set({ hydrated }),
      resetTheme: () => set(defaultState),
    }),
    {
      name: "drais-theme-store",
      version: 3,
      // v2 → v3: no themePreference existed. Preserve the user's current
      // resolved theme as an explicit choice so nobody's UI flips on upgrade.
      migrate: (persisted: any, from: number) => {
        if (persisted && from < 3 && !persisted.themePreference) {
          persisted.themePreference = persisted.mode === "dark" ? "dark" : "light";
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        // If following the OS, resolve the concrete mode immediately on load.
        if (state?.themePreference === "system") state.mode = resolveSystemMode();
        state?.setHydrated(true);
      },
    }
  )
);

export { useThemeStore };
