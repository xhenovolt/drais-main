/**
 * GET /api/cron/attendance-autocorrect
 *
 * Closes the loop that made JIPRA phone the founder before every print.
 *
 * Their device lives offline; staff connect it, it uploads the day, and the
 * times are hours wrong. For three weeks somebody opened Time Health and
 * shifted the day by hand — the same −5h, day after day — before attendance
 * could be printed. This runs after the upload has finished and applies the
 * shift itself.
 *
 * "After the upload has finished" is the whole point of the timing: a device
 * that is still sending would leave the tail of the batch uncorrected and the
 * day half-right, which is worse than waiting. settledDevices() only returns
 * devices that have gone quiet, so a correction is never applied mid-upload.
 *
 * Today AND yesterday are swept, because a school that connects the device
 * late in the evening finishes uploading after local midnight.
 *
 * Safe to run as often as you like: correction is idempotent (recomputed from
 * device_reported_time, never an additive shift), days a person already
 * corrected are skipped, and a device reading the correct time is left alone.
 *
 * Scheduled via vercel.json; also callable with the CRON_SECRET header, and
 * with ?dry=1 to see what it WOULD do without writing anything.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { autoCorrectDay, settledDevices } from '@/lib/attendance/time-intelligence/autoCorrect';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** School-local date string for an instant, given the school's UTC offset. */
const localDateOf = (ms: number, offsetMin: number) =>
  new Date(ms + offsetMin * 60_000).toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dry') === '1';
  const now = Date.now();

  try {
    // Seed from a UTC-based date; each device is then re-checked against its
    // own school's local date below.
    const devices = await settledDevices(new Date(now).toISOString().slice(0, 10), now);

    const results: any[] = [];
    for (const d of devices) {
      const policy = await resolveTimePolicy(d.schoolId);
      const today = localDateOf(now, policy.offsetMinutes);
      const yesterday = localDateOf(now - 86_400_000, policy.offsetMinutes);

      for (const date of [today, yesterday]) {
        const r = await autoCorrectDay(d.schoolId, d.deviceSn, date, { dryRun, nowMs: now });
        // Only report days that mean something — a quiet "nothing to do" on
        // every device every run would bury the one line that matters.
        if (r.verdict === 'drift_detected' || r.verdict === 'insufficient_evidence') {
          results.push({
            school_id: r.schoolId, device_sn: r.deviceSn, date: r.localDate,
            verdict: r.verdict, drift_hours: r.driftHours, confidence: r.confidence,
            punches: r.punches, applied: r.applied, affected: r.affected ?? 0,
            correction_id: r.correctionId ?? null, reason: r.reason,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      devices_settled: devices.length,
      corrected: results.filter((r) => r.applied).length,
      needs_review: results.filter((r) => !r.applied).length,
      results,
      ran_at: new Date(now).toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Auto-correct sweep failed' }, { status: 500 });
  }
}
