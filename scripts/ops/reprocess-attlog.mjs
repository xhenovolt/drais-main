// Reprocess ATTLOG punches that reached zk_raw_logs but never became attendance.
//
//   node scripts/ops/reprocess-attlog.mjs --since 2026-10-14 [--school 12020] [--apply] [--base http://localhost:3000]
//
// Dry run (default): parses every raw ATTLOG upload in the window and counts, per device, how many
// punches already exist in zk_attendance_logs (same device, device user, punch time) and how many are
// missing. Never deletes or edits raw device logs.
//
// --apply: replays ONLY the missing lines through the live handler (POST /iclock/cdata, the exact path
// a device uses), so matching, attendance evaluation and SMS rules run the normal way. The handler
// de-duplicates punches, and only missing lines are sent, so running it twice creates nothing new.
import mysql from 'mysql2/promise';
import fs from 'fs';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const since = arg('--since', '2026-10-14');
const school = arg('--school');
const apply = process.argv.includes('--apply');
const base = arg('--base', 'http://localhost:3000');

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const c = await mysql.createConnection({ uri: env.TIDB_CONNECTION_STRING, ssl: { rejectUnauthorized: true }, timezone: 'Z' });

const [raws] = await c.query(
  `SELECT id, device_sn, school_id, raw_body, created_at FROM zk_raw_logs
    WHERE http_method = 'POST' AND query_string LIKE '%table=ATTLOG%' AND created_at >= ? ${school ? 'AND school_id = ?' : ''}
    ORDER BY id`, school ? [since, school] : [since]);

// Everything already stored for these devices in the window, fetched once and matched in memory.
const sns = [...new Set(raws.map(r => r.device_sn))];
const have = new Map(); // `${sn}|${pin}` -> [epoch ms of check_time / device_reported_time]
if (sns.length) {
  const [rows] = await c.query(
    `SELECT device_sn, device_user_id, check_time, device_reported_time FROM zk_attendance_logs
      WHERE device_sn IN (?) AND check_time >= DATE_SUB(?, INTERVAL 1 DAY)`, [sns, since]);
  for (const x of rows) {
    const k = `${x.device_sn}|${x.device_user_id}`;
    const arr = have.get(k) || []; have.set(k, arr);
    if (x.check_time) arr.push(new Date(x.check_time).getTime());
    if (x.device_reported_time) arr.push(new Date(x.device_reported_time).getTime());
  }
}
// The device writes EAT wall-clock time; stored times may be UTC or clock-corrected: accept the line as
// present when a stored punch for that person sits at the same instant read as EAT or as UTC (±2 min).
const isPresent = (sn, pin, when) => {
  const asUtc = Date.parse(when.replace(' ', 'T') + 'Z');
  const cands = [asUtc, asUtc - 3 * 3600_000];
  return (have.get(`${sn}|${pin}`) || []).some(t => cands.some(x => Math.abs(t - x) <= 120_000));
};

const stats = {}; // device -> {raw, lines, present, missing, unparseable}
const missingByDevice = {};
for (const r of raws) {
  const s = (stats[r.device_sn] ||= { school: r.school_id, rawUploads: 0, lines: 0, present: 0, missing: 0, unparseable: 0 });
  s.rawUploads++;
  for (const line of String(r.raw_body || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const pin = cols[0]?.trim(); const when = cols[1]?.trim();
    s.lines++;
    if (!pin || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(when || '')) { s.unparseable++; continue; }
    if (isPresent(r.device_sn, pin, when)) s.present++;
    else { s.missing++; (missingByDevice[r.device_sn] ||= []).push(line); }
  }
}
console.log(`mode: ${apply ? 'APPLY' : 'DRY RUN'}  since: ${since}  raw ATTLOG uploads: ${raws.length}`);
console.table(stats);

if (apply) {
  for (const [sn, lines] of Object.entries(missingByDevice)) {
    for (let i = 0; i < lines.length; i += 50) {
      const body = lines.slice(i, i + 50).join('\n') + '\n';
      const res = await fetch(`${base}/iclock/cdata?SN=${encodeURIComponent(sn)}&table=ATTLOG&Stamp=9999&path=cdata`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain', 'User-Agent': 'DRAIS reprocess-attlog' }, body,
      });
      console.log(sn, `lines ${i + 1}-${Math.min(i + 50, lines.length)}`, res.status, (await res.text()).trim());
    }
  }
}
await c.end();
