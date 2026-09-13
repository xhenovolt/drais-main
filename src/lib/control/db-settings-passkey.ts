import bcrypt from 'bcryptjs';
import { getSetting, setSetting } from '@/lib/control/platform-settings';

const SETTING_KEY = 'database_settings_passkey_hash';
const INITIAL_PASSKEY = 'BuyABottleOfSoda';

export async function ensureDatabaseSettingsPasskey(): Promise<void> {
  const existing = await getSetting(SETTING_KEY);
  if (!existing) await setSetting(SETTING_KEY, await bcrypt.hash(INITIAL_PASSKEY, 12));
}

export async function verifyDatabaseSettingsPasskey(passkey: string): Promise<boolean> {
  await ensureDatabaseSettingsPasskey();
  const hash = await getSetting(SETTING_KEY);
  return Boolean(hash && passkey && await bcrypt.compare(passkey, hash));
}

export async function resetDatabaseSettingsPasskey(nextPasskey: string): Promise<void> {
  await setSetting(SETTING_KEY, await bcrypt.hash(nextPasskey, 12));
}

export function isValidDatabaseSettingsPasskey(passkey: string): boolean {
  return passkey.length >= 12 && passkey.length <= 200;
}
