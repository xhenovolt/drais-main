import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

/**
 * Protected Layout for Students Routes
 * Enforces authentication for all student management pages
 */
export default async function StudentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Check for valid session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('drais_session')?.value;

  if (!sessionToken) {
    console.log('[STUDENTS-LAYOUT] ❌ No session token - redirecting to /login');
    redirect('/login?reason=no_session');
  }

  console.log('[STUDENTS-LAYOUT] ✅ Session valid - allowing access');

  return <>{children}</>;
}
