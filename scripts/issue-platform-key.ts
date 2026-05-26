/**
 * Issue a DRAIS platform API key directly (no HTTP, no cookie session needed).
 *
 *   npx tsx scripts/issue-platform-key.ts \
 *     --consumer jeton \
 *     --label "JETON production" \
 *     --scopes schools:read,schools:write,subscriptions:read,subscriptions:write,usage:read,analytics:read,events:read,webhooks:manage,audit:read,health:read \
 *     [--rate 600] [--ips 1.2.3.4,5.6.7.8] [--expires 2027-01-01] [--env live|test]
 *
 * Requires the platform_api_foundation.sql migration to be applied first.
 * The token is printed ONCE — copy it immediately, it cannot be recovered.
 */
import 'dotenv/config';
import { issuePlatformKey } from '../src/lib/platform/keys';
import { PLATFORM_SCOPES, type PlatformScope } from '../src/lib/platform/scopes';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const consumer = arg('consumer');
  const label    = arg('label') ?? null;
  const scopesIn = arg('scopes') ?? PLATFORM_SCOPES.join(',');
  const rate     = arg('rate') ? Number(arg('rate')) : 600;
  const ipsIn    = arg('ips');
  const expIn    = arg('expires');
  const env      = (arg('env') === 'test' ? 'test' : 'live') as 'live' | 'test';

  if (!consumer) {
    console.error('Missing --consumer (e.g. jeton, xhaira, consty, jorc, xheton, internal_ops)');
    process.exit(1);
  }

  const scopes = scopesIn.split(',').map(s => s.trim()).filter(Boolean) as PlatformScope[];
  for (const s of scopes) {
    if (!PLATFORM_SCOPES.includes(s)) {
      console.error(`Unknown scope: ${s}`);
      console.error(`Available: ${PLATFORM_SCOPES.join(', ')}`);
      process.exit(1);
    }
  }

  const allowedIps = ipsIn ? ipsIn.split(',').map(x => x.trim()).filter(Boolean) : undefined;
  const expiresAt  = expIn ? new Date(expIn) : null;

  const issued = await issuePlatformKey({
    consumer,
    label: label ?? undefined,
    scopes,
    allowedIps,
    rateLimitPerMin: rate,
    expiresAt,
    createdBy: null,
    environment: env,
  });

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' DRAIS Platform API Key issued');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` consumer  : ${issued.consumer}`);
  console.log(` key_id    : ${issued.keyId}`);
  console.log(` scopes    : ${issued.scopes.join(', ')}`);
  console.log(` rate/min  : ${rate}`);
  if (allowedIps) console.log(` ip allow  : ${allowedIps.join(', ')}`);
  if (expiresAt)  console.log(` expires   : ${expiresAt.toISOString()}`);
  console.log('');
  console.log(' TOKEN (copy NOW — shown only once):');
  console.log('');
  console.log(`   ${issued.token}`);
  console.log('');
  console.log(' Use in JETON as:');
  console.log(`   Authorization: Bearer ${issued.token}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
