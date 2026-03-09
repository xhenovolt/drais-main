'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

/**
 * List of PUBLIC routes that don't require authentication
 */
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
];

/**
 * Server Action: Check authentication and enforce route protection
 * Call this at the start of any protected page
 * 
 * Usage in page.tsx:
 * ```
 * import { enforceAuthentication } from '@/lib/auth/enforcement';
 * 
 * export default async function ProtectedPage() {
 *   await enforceAuthentication();
 *   // ... rest of page
 * }
 * ```
 */
export async function enforceAuthentication() {
 try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('drais_session')?.value;

    if (!sessionToken) {
      console.warn('[ENFORCE-AUTH] No session token - redirecting to /login');
      redirect('/login');
    }

    console.log('[ENFORCE-AUTH] ✅ Session valid - allowing access');
    return { authenticated: true };
  } catch (error: any) {
    console.error('[ENFORCE-AUTH] Error:', error);
    // If redirect() throws, it's normal - it's a Next.js control flow mechanism
    if (error?.digest?.includes?.('NEXT_REDIRECT')) {
      throw error;
    }
    redirect('/login');
  }
}

/**
 * Check if a route should be protected
 */
export function isProtectedRoute(pathname: string): boolean {
  return !PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route));
}
