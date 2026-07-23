/**
 * /profile → /settings/profile. The canonical profile editor lives under
 * Settings; this permanent redirect keeps every historical/menu link
 * working (the topbar dropdown previously 404'd here).
 */
import { redirect } from 'next/navigation';

export default function ProfileRedirect() {
  redirect('/settings/profile');
}
