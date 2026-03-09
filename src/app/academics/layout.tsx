import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function AcademicsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('drais_session')?.value;

  if (!sessionToken) {
    console.log('[ACADEMICS-LAYOUT] ❌ No session - redirecting to /login');
    redirect('/login?reason=no_session');
  }

  return <>{children}</>;
}