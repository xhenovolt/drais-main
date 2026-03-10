'use client';

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import FeatureUpdateNotification from '@/components/notifications/FeatureUpdateNotification';
import { AuthProvider } from '@/contexts/AuthContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import OnboardingOrchestrator from '@/components/onboarding/OnboardingOrchestrator';
import OnboardingCompletionBanner from '@/components/onboarding/OnboardingCompletionBanner';
import dynamic from 'next/dynamic';

const MobileOnboarding = dynamic(() => import('@/components/mobile/MobileOnboarding'), { ssr: false });

// Create a stable QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Route to title mapping
const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/students': 'Students',
  '/tahfiz': 'Tahfiz Overview',
  '/tahfiz/students': 'Tahfiz Students',
  '/tahfiz/records': 'Tahfiz Records',
  '/tahfiz/books': 'Tahfiz Books',
  '/tahfiz/portions': 'Tahfiz Portions',
  '/tahfiz/groups': 'Tahfiz Groups',
  '/tahfiz/attendance': 'Tahfiz Attendance',
  '/tahfiz/plans': 'Learning Plans',
  '/tahfiz/reports': 'Tahfiz Reports',
  // Add more routes as needed...
};

function getPageTitle(pathname: string): string {
  // Check for exact match first
  if (routeTitles[pathname]) {
    return `${routeTitles[pathname]} - DRAIS`;
  }
  
  // Check for partial matches (for dynamic routes)
  const matchingRoute = Object.keys(routeTitles).find(route => 
    pathname.startsWith(route) && route !== '/'
  );
  
  if (matchingRoute) {
    return `${routeTitles[matchingRoute]} - DRAIS`;
  }
  
  // Fallback: convert pathname to title
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'DRAIS';
  
  const title = segments[segments.length - 1]
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return `${title} - DRAIS`;
}

function DynamicTitle() {
  const pathname = usePathname();
  
  useEffect(() => {
    const title = getPageTitle(pathname);
    document.title = title;
  }, [pathname]);
  
  return null;
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const pathname = usePathname(); // Get the current route
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMobileOnboarding, setShowMobileOnboarding] = useState(false);

  // Check if this is the first visit for mobile onboarding
  useEffect(() => {
    const hasSeenMobileOnboarding = localStorage.getItem('drais_mobile_onboarding_seen');
    if (!hasSeenMobileOnboarding && typeof window !== 'undefined') {
      setShowMobileOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('drais_mobile_onboarding_seen', 'true');
    setShowMobileOnboarding(false);
  };

  // Routes where Sidebar and Navbar should be hidden
  // These are public/auth routes that don't need the main app shell
  const hideSidebarAndNavbar = 
    pathname === '/' ||                          // Landing page (redirects to login)
    pathname === '/login' ||                     // Login page
    pathname === '/signup' ||                    // Signup page
    pathname.startsWith('/auth') ||              // All auth routes (/auth/login, /auth/signup, etc.)
    pathname === '/forgot-password' ||           // Password reset
    pathname.startsWith('/reset-password') ||    // Password reset with token
    pathname === '/unauthorized' ||              // Unauthorized page
    pathname === '/forbidden' ||                 // Forbidden page
    pathname === '/server-error' ||              // Error pages
    pathname === '/academics/reports';           // Report printing layout

  return (
    <div className="min-h-screen">
      <DynamicTitle />
      {!hideSidebarAndNavbar && <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />}
      {!hideSidebarAndNavbar && <Sidebar />}
      <main
        className={clsx(
          "transition-all duration-300",
          hideSidebarAndNavbar ? "pt-0" : "pt-16", // Conditional padding-top
          !hideSidebarAndNavbar && (theme.sidebarCollapsed ? "md:ml-16" : "md:ml-72"),
          hideSidebarAndNavbar && "ml-0" // No margin when Sidebar is hidden
        )}
      >
        {children}
      </main>
      <FeatureUpdateNotification />
      {/* Onboarding system — global modals, tour, help search */}
      <OnboardingOrchestrator />
      <OnboardingCompletionBanner />
      {/* Mobile onboarding slides */}
      {showMobileOnboarding && <MobileOnboarding onComplete={handleOnboardingComplete} />}
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased selection:bg-[var(--color-primary)]/20">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OnboardingProvider>
              <ThemeProvider>
                <I18nProvider>
                  <LayoutContent>{children}</LayoutContent>
                </I18nProvider>
              </ThemeProvider>
            </OnboardingProvider>
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
