import { apiErrorMessage } from '@/lib/errorMessage';
const cases: Array<[string, unknown, string]> = [
  ['shape A (rbac/requireModule)', { error: "Forbidden: missing permission 'audit.read'", code: 'FORBIDDEN' }, 'string'],
  ['shape B (ApiErrorFactory.sessionExpired)', { success: false, error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please log in again.' } }, 'string'],
  ['shape B (forbidden)', { success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource' } }, 'string'],
  ['module disabled', { error: "Module 'tahfiz' is not enabled for this school", code: 'MODULE_DISABLED' }, 'string'],
  ['enrollments style', { success: false, message: 'Not authenticated', error: { code: 'AUTH_REQUIRED' } }, 'string'],
  ['bare string', 'Internal server error', 'string'],
  ['null body', null, 'fallback'],
  ['empty object', {}, 'fallback'],
];
let bad = 0;
for (const [label, body] of cases) {
  const out = apiErrorMessage(body, 'FALLBACK');
  const ok = out !== '[object Object]' && out.length > 0;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(42)} → "${out}"`);
}
console.log(bad ? `\n${bad} FAILED` : '\nall shapes produce a readable sentence — no [object Object]');
process.exit(bad ? 1 : 0);
