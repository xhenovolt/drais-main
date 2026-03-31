'use client';

import React, { useState, ReactNode } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { MobileDrawer } from './MobileDrawer';
import { useRouteValidator } from '@/hooks/useRouteValidator';

interface MainLayoutProps {
  children: ReactNode;
}

/**
 * GLOBAL LAYOUT ARCHITECTURE
 *
 * Desktop (lg+): Topbar + Sidebar (left) + Content
 * Mobile (<lg):  NO Topbar — Bottom Navigation (4 items + More drawer)
 *
 * RULES:
 * - Topbar NEVER visible on mobile (hidden lg:block)
 * - BottomNav ALWAYS visible on mobile (lg:hidden)
 * - Sidebar NEVER visible on mobile
 * - Content bottom-padded on mobile to clear BottomNav
 * - No horizontal scroll (overflow-x: hidden via globals.css)
 */
export const MainLayout = ({ children }: MainLayoutProps) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Monitor route validity on app startup
  useRouteValidator();

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
      {/* MOBILE DRAWER (full-screen, triggered by BottomNav "More") */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />

      {/* TOPBAR — Desktop only (hidden on mobile) */}
      <div className="hidden lg:block">
        <Topbar onMenuClick={() => setMobileDrawerOpen(true)} />
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR — Desktop only */}
        <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
          <Sidebar />
        </div>

        {/* CONTENT — Scrollable, padded bottom on mobile for BottomNav */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 lg:pb-0 lg:pt-16">
          {children}
        </main>
      </div>

      {/* BOTTOM NAVIGATION — Mobile only (4 items: Dashboard, Students, Attendance, More) */}
      <BottomNav onMoreClick={() => setMobileDrawerOpen(true)} />
    </div>
  );
};
