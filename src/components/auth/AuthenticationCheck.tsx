import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ReactNode } from 'react';

/**
 * Server component that enforces authentication
 * Must be imported and rendered at the top of protected pages
 */
export async function AuthenticationCheck() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('drais_session')?.value;

    if (!sessionToken) {
      console.log('[AUTH-CHECK] ❌ No session - redirecting to /login');
      redirect('/login?reason=unauthorized');
    }

    console.log('[AUTH-CHECK] ✅ Session valid');
    return null; // Don't render anything, just validate
  } catch (error: any) {
    // Next.js redirect() throws which is expected
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('[AUTH-CHECK] Error:', error);
    redirect('/login?reason=error');
  }
}

/**
 * Protected page wrapper  
 * Wrap your page component with this
 */
export function ProtectedPageWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
