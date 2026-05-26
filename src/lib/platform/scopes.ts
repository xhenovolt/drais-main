export const PLATFORM_SCOPES = [
  'schools:read',
  'schools:write',
  'subscriptions:read',
  'subscriptions:write',
  'usage:read',
  'analytics:read',
  'events:read',
  'webhooks:manage',
  'audit:read',
  'health:read',
] as const;

export type PlatformScope = (typeof PLATFORM_SCOPES)[number];

export function hasScope(granted: string[], required: PlatformScope): boolean {
  if (!Array.isArray(granted)) return false;
  if (granted.includes('*')) return true;
  return granted.includes(required);
}
