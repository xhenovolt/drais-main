import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

/**
 * Protected Layout
 * This layout wraps all protected pages and enforces authentication
 * 
 * Routes using this layout: /dashboard, /students, /tahfiz, etc.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // ✅ SERVER-SIDE AUTH CHECK
  // This runs on every page load before rendering
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('drais_session')?.value;

  if (!sessionToken) {
    console.log('[PROTECTED-LAYOUT] ❌ No session token - redirecting to /login');
    redirect('/login?reason=no_session');
  }

  console.log('[PROTECTED-LAYOUT] ✅ Session valid - rendering protected content');

  return <>{children}</>;
}
