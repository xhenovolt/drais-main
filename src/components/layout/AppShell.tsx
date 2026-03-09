"use client";
import React from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import Footer from "@/components/layout/Footer";
import { ThemeCustomizerPanel } from "@/components/layout/ThemeCustomizerPanel";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { useThemeStore } from "@/hooks/useThemeStore";
import { useSchoolConfig } from "@/hooks/useSchoolConfig";

const AUTH_PREFIXES = ["/auth", "/login", "/register", "/forgot-password", "/reset-password"]; // extend as needed

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isAuth = AUTH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
  const { school } = useSchoolConfig();

  const collapsed = useThemeStore.getState().sidebarCollapsed;
  const pos = useThemeStore.getState().sidebarPosition;

  if (isAuth) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md mx-auto bg-white/70 dark:bg-slate-900/60 backdrop-blur rounded-2xl p-8 shadow border border-white/30 dark:border-white/10">
            {children}
          </div>
        </main>
        <footer className="py-6 text-center text-xs text-gray-600 dark:text-gray-400">
          © {new Date().getFullYear()} {school.name} Management.
        </footer>
      </div>
    );
  }

  return (
    <I18nProvider>
      <Navbar />
      <Sidebar />
      <div className={`pt-16 pb-16 md:pb-0 md:pr-6 px-4 transition-all ${collapsed ? (pos==='left'? 'md:pl-16':'md:pr-16') : (pos==='left'? 'md:pl-64':'md:pr-64')}`} data-sidebar>
        <main className="max-w-[1600px] mx-auto">
          {children}
          <Footer />
        </main>
      </div>
      <BottomNav />
      <ThemeCustomizerPanel />
    </I18nProvider>
  );
};

export default AppShell;