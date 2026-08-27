'use client';

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from '@/contexts/AuthContext';
import { ProgressProvider } from '@/contexts/ProgressContext';
import dynamic from 'next/dynamic';
const AuthenticatedShell = dynamic(() => import('@/components/layout/AuthenticatedShell'), { ssr: false });

function RouteScopedI18nProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPreConnectionRoute = pathname === '/' || pathname === '/login' || pathname === '/signup' ||
    pathname.startsWith('/auth') || pathname === '/forgot-password' || pathname.startsWith('/reset-password') ||
    pathname === '/unauthorized' || pathname === '/forbidden' || pathname === '/server-error';
  return <I18nProvider loadSchoolDefault={!isPreConnectionRoute}>{children}</I18nProvider>;
}

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
  useEffect(() => { document.title = getPageTitle(pathname); }, [pathname]);
  return null;
}

function OrientationLock() {
  useEffect(() => {
    const nav = navigator as any;
    const orientation = screen.orientation || nav.mozOrientation || nav.msOrientation;
    orientation?.lock?.('portrait').catch(() => {});
  }, []);
  return null;
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
        <AuthenticatedShell>{children}</AuthenticatedShell>
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
              <ThemeProvider>
                <RouteScopedI18nProvider><LayoutContent>{children}</LayoutContent></RouteScopedI18nProvider>
              </ThemeProvider>
            </AuthProvider>
          </ProgressProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
