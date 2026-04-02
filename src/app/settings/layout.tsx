import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import SettingsSidebar from '@/components/settings/SettingsSidebar';

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('drais_session')?.value;

  if (!sessionToken) {
    console.log('[SETTINGS-LAYOUT] ❌ No session - redirecting to /login');
    redirect('/login?reason=no_session');
  }

  return (
    <div className="flex h-full min-h-0">
      <SettingsSidebar />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}