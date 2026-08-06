export function shouldEnforceForcedPasswordReset(): boolean {
  const value = process.env.ENFORCE_FORCED_PASSWORD_RESET;
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
