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
 * PHASE 1 - GLOBAL LAYOUT ARCHITECTURE
 * 
 * Mobile-First Unified Layout System
 * 
 * STRUCTURE:
 * - Desktop (lg+): Sidebar (left) + Content (right)
 * - Mobile (<lg): Topbar + Content + BottomNav
 * - Mobile Sidebar: Hidden drawer (triggered by menu icon)
 * 
 * RULES:
 * - Sidebar NEVER visible on mobile
 * - BottomNav ALWAYS visible on mobile
 * - Content scrolls independently
 * - Touch zones: 44px minimum
 */
export const MainLayout = ({ children }: MainLayoutProps) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  
  // Monitor route validity on app startup
  useRouteValidator();

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* MOBILE DRAWER (hidden by default, toggles on mobile) */}
      <MobileDrawer 
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />

      {/* TOPBAR - Always visible, mobile-first */}
      <Topbar 
        onMenuClick={() => setMobileDrawerOpen(true)}
      />

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR - Desktop only (hidden on mobile via tailwind) */}
        <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
          <Sidebar />
        </div>

        {/* CONTENT - Scrollable independent area */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* BOTTOM NAVIGATION - Mobile only (hidden on desktop) */}
      <BottomNav />
    </div>
  );
};
