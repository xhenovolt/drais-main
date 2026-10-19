// Fill device_status_events from contact history (device_heartbeats + zk_raw_logs pushes).
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/ops/backfill-device-uptime.ts [--days 60]
// Additive and idempotent: each device continues from its own cursor (device_status_state), so a
// second run appends nothing new. Never touches heartbeats, raw logs or devices.
import { syncDeviceStatusEvents, ensureDeviceUptimeSchema, offlineThresholdMinutes } from '@/lib/devices/uptime';
import { query } from '@/lib/db';

const i = process.argv.indexOf('--days');
const days = i > 0 ? Number(process.argv[i + 1]) : 60;

(async () => {
  await ensureDeviceUptimeSchema();
  console.log(`threshold: ${await offlineThresholdMinutes()} min · history window: ${days} days`);
  const appended = await syncDeviceStatusEvents({ since: new Date(Date.now() - days * 86_400_000), source: 'backfill' });
  const rows = (await query(
    `SELECT device_sn, COUNT(*) n, SUM(status = 'offline') outages, MIN(at) first_at, MAX(at) last_at FROM device_status_events GROUP BY device_sn`, [],
  )) as any[];
  console.log(`appended ${appended} events`);
  console.table(rows.map((r) => ({ sn: r.device_sn, events: Number(r.n), outages: Number(r.outages), first: new Date(r.first_at).toISOString().slice(0, 16), last: new Date(r.last_at).toISOString().slice(0, 16) })));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
