import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

/**
 * Server-side authentication check
 * This runs on every protected page load and redirects unauthenticated users
 */
async  function checkAuthentication() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('drais_session')?.value;

    if (!sessionToken) {
      // No session token - redirect to login
      console.log('[AUTH-CHECK] No session token found - redirecting to /login');
      redirect('/login');
    }

    // Session token exists - allow to continue
    console.log('[AUTH-CHECK] Valid session token - allowing access');
    return { authenticated: true };
  } catch (error) {
    console.error('[AUTH-CHECK] Error checking authentication:', error);
    redirect('/login');
  }
}

interface ProtectedLayoutProps {
  children: ReactNode;
}

/**
 * Layout wrapper for protected routes
 * Ensures all protected routes require authentication
 */
export async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  await checkAuthentication();
  return children;
}
