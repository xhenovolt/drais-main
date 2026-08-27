'use client';

/**
 * App-only providers and overlays. This module is deliberately loaded only
 * after the public login/connection UI route has been selected, so those
 * screens do not issue authenticated bootstrap requests or load dashboard UI.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { TermProvider } from '@/contexts/TermContext';
import FeatureUpdateNotification from '@/components/notifications/FeatureUpdateNotification';
import ImpersonationBanner from '@/components/control/ImpersonationBanner';
import ProgressOverlay from '@/components/ui/ProgressOverlay';
import OnboardingOrchestrator from '@/components/onboarding/OnboardingOrchestrator';
import OnboardingCompletionBanner from '@/components/onboarding/OnboardingCompletionBanner';
import { MainLayout } from '@/components/layout/MainLayout';
import HeartbeatProvider from '@/components/providers/HeartbeatProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { Toaster } from 'react-hot-toast';
import { SWRConfig } from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import ErrorBoundary from '@/components/ErrorBoundary';
import dynamic from 'next/dynamic';

const MobileOnboarding = dynamic(() => import('@/components/mobile/MobileOnboarding'), { ssr: false });
const SplashScreen = dynamic(() => import('@/components/SplashScreen'), { ssr: false });
const LiveIdentityPopup = dynamic(
  () => import('@/components/students/LiveIdentityPopup').then(m => m.LiveIdentityPopup),
  { ssr: false },
);

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard', '/students': 'Students', '/tahfiz': 'Tahfiz Overview',
  '/tahfiz/students': 'Tahfiz Students', '/tahfiz/records': 'Tahfiz Records',
  '/tahfiz/books': 'Tahfiz Books', '/tahfiz/portions': 'Tahfiz Portions',
  '/tahfiz/groups': 'Tahfiz Groups', '/tahfiz/attendance': 'Tahfiz Attendance',
  '/tahfiz/plans': 'Learning Plans', '/tahfiz/reports': 'Tahfiz Reports',
};

function useAppChrome() {
  const pathname = usePathname();
  useEffect(() => {
    const matching = Object.keys(routeTitles).find(route => pathname.startsWith(route) && route !== '/');
    const leaf = pathname.split('/').filter(Boolean).pop();
    document.title = routeTitles[pathname] || (matching ? routeTitles[matching] : leaf ? leaf.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : 'DRAIS') + (matching || routeTitles[pathname] ? ' - DRAIS' : '');
    const nav = navigator as any;
    const orientation = screen.orientation || nav.mozOrientation || nav.msOrientation;
    orientation?.lock?.('portrait').catch(() => {});
  }, [pathname]);
}

export default function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const [showMobileOnboarding, setShowMobileOnboarding] = useState(false);
  const [showSplash, setShowSplash] = useState(() => typeof window !== 'undefined' && !sessionStorage.getItem('drais_splash_shown'));
  useAppChrome();

  useEffect(() => {
    if (!localStorage.getItem('drais_mobile_onboarding_seen')) setShowMobileOnboarding(true);
  }, []);

  return (
    <OnboardingProvider>
      <TermProvider>
        <ToastProvider>
            <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>
              <ErrorBoundary>
                <ImpersonationBanner />
                <MainLayout><HeartbeatProvider /><LiveIdentityPopup />{children}</MainLayout>
                <FeatureUpdateNotification />
                <OnboardingOrchestrator />
                <OnboardingCompletionBanner />
                {showMobileOnboarding && <MobileOnboarding onComplete={() => { localStorage.setItem('drais_mobile_onboarding_seen', 'true'); setShowMobileOnboarding(false); }} />}
                {showSplash && <SplashScreen onFinished={() => { sessionStorage.setItem('drais_splash_shown', '1'); setShowSplash(false); }} />}
              </ErrorBoundary>
              <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            </SWRConfig>
        </ToastProvider>
      </TermProvider>
      <ProgressOverlay />
    </OnboardingProvider>
  );
}
