'use client';

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import FeatureUpdateNotification from '@/components/notifications/FeatureUpdateNotification';
import { AuthProvider } from '@/contexts/AuthContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { TermProvider } from '@/contexts/TermContext';
import { ProgressProvider } from '@/contexts/ProgressContext';
import ProgressOverlay from '@/components/ui/ProgressOverlay';
import OnboardingOrchestrator from '@/components/onboarding/OnboardingOrchestrator';
import OnboardingCompletionBanner from '@/components/onboarding/OnboardingCompletionBanner';
import dynamic from 'next/dynamic';
import { MainLayout } from "@/components/layout/MainLayout";
import HeartbeatProvider from '@/components/providers/HeartbeatProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { Toaster } from 'react-hot-toast';
import { SWRConfig } from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import ErrorBoundary from '@/components/ErrorBoundary';

const MobileOnboarding = dynamic(() => import('@/components/mobile/MobileOnboarding'), { ssr: false });
const SplashScreen = dynamic(() => import('@/components/SplashScreen'), { ssr: false });

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

// Lock the PWA to portrait orientation when the Screen Orientation API is available
// (works in Chrome Android when installed as PWA / fullscreen)
function OrientationLock() {
  useEffect(() => {
    const nav = navigator as any;
    const orientation = screen.orientation || nav.mozOrientation || nav.msOrientation;
    if (orientation && typeof orientation.lock === 'function') {
      orientation.lock('portrait').catch(() => {
        // lock() throws if not in fullscreen — ignore silently
      });
    }
  }, []);
  return null;
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMobileOnboarding, setShowMobileOnboarding] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('drais_splash_shown');
  });

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
    pathname === '/academics/reports' ||          // Report printing layout
    pathname.startsWith('/rpt');                 // Standalone rpt.html clone

  return (
    <div className="min-h-screen">
      <DynamicTitle />
      <OrientationLock />
      {hideSidebarAndNavbar ? (
        // For public/auth routes: no layout
        <main className="pt-0 ml-0">
          {children}
        </main>
      ) : (
        // For protected routes: use MainLayout (mobile-first architecture)
        <MainLayout>
          <HeartbeatProvider />
          {children}
        </MainLayout>
      )}
      <FeatureUpdateNotification />
      {/* Onboarding system — global modals, tour, help search */}
      <OnboardingOrchestrator />
      <OnboardingCompletionBanner />
      {/* Mobile onboarding slides */}
      {showMobileOnboarding && <MobileOnboarding onComplete={handleOnboardingComplete} />}
      {/* Splash screen — shown once per session */}
      {showSplash && (
        <SplashScreen
          onFinished={() => {
            sessionStorage.setItem('drais_splash_shown', '1');
            setShowSplash(false);
          }}
        />
      )}
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
      <head>
        <meta name="application-name" content="DRAIS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DRAIS" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0A2463" />
        <meta name="msapplication-TileColor" content="#0A2463" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
      </head>
      <body className="font-sans antialiased selection:bg-[var(--color-primary)]/20">
        <QueryClientProvider client={queryClient}>
          <ProgressProvider>
            <AuthProvider>
              <OnboardingProvider>
                <TermProvider>
                  <ThemeProvider>
                    <I18nProvider>
                      <ToastProvider>
                        <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>
                          <ErrorBoundary>
                            <LayoutContent>{children}</LayoutContent>
                          </ErrorBoundary>
                          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
                        </SWRConfig>
                      </ToastProvider>
                    </I18nProvider>
                  </ThemeProvider>
                </TermProvider>
              </OnboardingProvider>
            </AuthProvider>
            <ProgressOverlay />
          </ProgressProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
