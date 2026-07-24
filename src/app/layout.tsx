'use client';

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import FeatureUpdateNotification from '@/components/notifications/FeatureUpdateNotification';
import ImpersonationBanner from '@/components/control/ImpersonationBanner';
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
// Phase 7 — global live-scan popup. Was previously mounted only on
// /students/list (F10 in the audit). Lives at the app shell layer so
// every authenticated route shows scan events in real time. Users can
// opt out via localStorage['drais.liveScan.disabled']='1'.
const LiveIdentityPopup = dynamic(
  () => import('@/components/students/LiveIdentityPopup').then(m => m.LiveIdentityPopup),
  { ssr: false },
);

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
    pathname.startsWith('/portal') ||            // Parent portal (legacy) — own shell, no staff nav
    pathname.startsWith('/parent') ||            // Parent portal (Track A) — own shell, no staff nav
    pathname.startsWith('/rpt') ||               // Standalone rpt.html clone
    pathname.startsWith('/print-snapshot') ||    // Naked DRCE snapshot print/PDF target
    pathname.startsWith('/print-transcript') ||  // Naked cumulative transcript print/PDF target
    pathname.startsWith('/verify') ||            // Public QR verification page
    pathname.startsWith('/control');             // DRAIS Control Center — Xhenvolt console, own shell + own auth

  return (
    <div className="min-h-screen">
      <DynamicTitle />
      <OrientationLock />
      {hideSidebarAndNavbar ? (
        // For public/auth/print routes: no layout, no global overlays.
        // The overlays below (onboarding, splash, etc.) intentionally
        // do NOT render here because puppeteer + naked print pages
        // would otherwise capture them on top of the actual report.
        <main className="pt-0 ml-0">
          {children}
        </main>
      ) : (
        <>
          <ImpersonationBanner />
          <MainLayout>
            <HeartbeatProvider />
            {/* Phase 7 — global live-scan popup (was /students/list only). */}
            <LiveIdentityPopup />
            {children}
          </MainLayout>
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
        </>
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
        {/* Anti-flicker: apply the persisted theme to <html> BEFORE first paint
            so a dark-mode user never sees a white flash. Reads the same
            zustand-persisted store the ThemeProvider hydrates from. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  var raw=localStorage.getItem('drais-theme-store');
  var pref='system';
  if(raw){var s=(JSON.parse(raw)||{}).state||{};pref=s.themePreference||(s.mode||'system');}
  var dark = (pref==='dark') || ((pref==='system'||!pref) && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var el=document.documentElement;
  if(dark){el.classList.add('dark');el.dataset.themeMode='dark';}else{el.classList.remove('dark');el.dataset.themeMode='light';}
}catch(e){}})();`,
          }}
        />
        <meta name="application-name" content="DRAIS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DRAIS" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0A2463" />
        <meta name="msapplication-TileColor" content="#0A2463" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png?v=drais2026" />
        <link rel="manifest" href="/manifest.json" />
        {/* ?v= cache-buster forces browsers/PWAs to drop the OLD cached DRAIS
            favicon after the 2026 logo refresh (same paths, new file bytes). */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=drais2026" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png?v=drais2026" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png?v=drais2026" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=drais2026" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png?v=drais2026" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png?v=drais2026" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png?v=drais2026" />
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
