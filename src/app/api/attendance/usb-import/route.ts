/**
 * USB attendance import — Phase 5 extensibility adapter
 * (docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md §7, "USB/CSV import...
 * reusing the same staging").
 *
 * The final operational fallback: device push (ADMS) failed, TCP pull
 * (direct or relay) failed, so an operator plugged the device into a USB
 * stick, exported its log, and now needs to bring that file into DRAIS.
 *
 * This route is an ADAPTER, not a second attendance engine — it turns file
 * bytes into RawPunch[] (usb-parser.ts) and feeds the EXACT SAME pipeline
 * TCP pull uses: beginAcquisition → stageRecords → validateAcquisition →
 * finishAcquisition. Committing to attendance_raw_events happens later,
 * from the SAME operator-confirmed path as every other acquisition method
 * (POST /api/attendance/acquisitions { action: 'commit' }) — this route
 * NEVER writes to attendance_raw_events.
 *
 * Device-identity binding: a USB file carries no network context (no LAN
 * IP, no live TCP handshake) to infer which registered device it came
 * from, unlike TCP pull. The operator must explicitly pick a device_sn
 * that is already registered for this school — the same tenancy-
 * verification lesson RC-6 (TCP-pull forensic audit) drew from a device
 * silently misattributed by inferred context instead of a verified serial.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { getDeviceTimeContext, resolveTimePolicy } from '@/lib/attendance/device-clock';
import { beginAcquisition, stageRecords, finishAcquisition } from '@/lib/attendance/acquisition/service';
import { validateAcquisition } from '@/lib/attendance/acquisition/validate';
import { wallDate } from '@/lib/attendance/acquisition/wall-time';
import { parseZktecoUsbFile } from '@/lib/attendance/acquisition/usb-parser';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — a real device log is a few hundred KB to a few MB of text

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 });
  }

  const file = form.get('file');
  const deviceSn = String(form.get('device_sn') || '').trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!deviceSn) {
    return NextResponse.json({ error: 'device_sn is required — DRAIS cannot infer which device a USB file came from' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File is ${Math.round(file.size / 1024 / 1024)}MB, exceeding the ${MAX_FILE_BYTES / 1024 / 1024}MB limit` }, { status: 413 });
  }

  // Tenancy verification (RC-6 lesson): the device must be a REAL, registered
  // device belonging to THIS school — never trust the client-supplied serial
  // on faith, since an operator could mistype or a stale form could resubmit
  // a different school's device.
  const deviceRows = (await query(
    `SELECT sn FROM devices WHERE sn = ? AND school_id = ? LIMIT 1`,
    [deviceSn, session.schoolId],
  )) as Array<{ sn: string }>;
  if (!deviceRows.length) {
    return NextResponse.json({ error: `No device with serial "${deviceSn}" is registered for this school — register it first or pick the correct device.` }, { status: 404 });
  }

  const startMs = Date.now();
  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json({ error: 'Could not read the file as text' }, { status: 400 });
  }

  const { punches, errors: parseErrors, delimiter } = parseZktecoUsbFile(text);

  if (!punches.length) {
    return NextResponse.json({
      error: parseErrors.length
        ? `Could not parse any punches from this file (${parseErrors.length} line(s) failed) — is this a ZKTeco attendance export?`
        : 'File contains no data rows',
      parseErrors: parseErrors.slice(0, 20),
    }, { status: 400 });
  }

  const dates = punches.map(p => wallDate(p.wallTime)).sort();
  const windowFrom = dates[0];
  const windowTo = dates[dates.length - 1];

  const acquisitionId = await beginAcquisition({
    schoolId: session.schoolId,
    method: 'usb_import',
    deviceSn,
    deviceIp: null,
    requestedBy: session.userId ?? null,
    windowFrom,
    windowTo,
  });

  try {
    const { staged, invalid } = await stageRecords(acquisitionId, punches);

    const deviceTz = await getDeviceTimeContext(deviceSn);
    const timePolicy = await resolveTimePolicy(session.schoolId);
    const tzOffsetMinutes = deviceTz.tzOffsetMinutes ?? timePolicy.offsetMinutes;

    // No live device to probe for "what time is it right now" — USB import
    // has no deviceWallNow. The operator's time-check step (same UI as TCP
    // pull) is how drift gets caught here; validateAcquisition already
    // handles a null deviceWallNow without treating it as a signal either way.
    const validation = await validateAcquisition({
      schoolId: session.schoolId,
      acquisitionId,
      deviceSn,
      tzOffsetMinutes,
      deviceWallNow: null,
    });

    await finishAcquisition(acquisitionId, {
      status: 'validated',
      deviceLogCount: punches.length + parseErrors.length,
      recordsReceived: punches.length,
      recordsStaged: staged,
      recordsFailed: invalid + parseErrors.length,
      durationMs: Date.now() - startMs,
      warnings: parseErrors.length ? [`${parseErrors.length} line(s) in the uploaded file could not be parsed and were skipped — see parseErrors.`] : null,
    });

    return NextResponse.json({
      success: true,
      acquisitionId,
      mode: 'usb_import',
      deviceSn,
      windowFrom,
      windowTo,
      totalOnDevice: punches.length + parseErrors.length,
      staged,
      invalid,
      validation,
      delimiter,
      parseErrors: parseErrors.slice(0, 20),
      parseErrorCount: parseErrors.length,
    });
  } catch (err: any) {
    await finishAcquisition(acquisitionId, {
      status: 'failed',
      errorMessage: String(err?.message || err).slice(0, 1000),
      durationMs: Date.now() - startMs,
    }).catch(() => undefined);
    return NextResponse.json({ error: err?.message || 'USB import failed' }, { status: 500 });
  }
}
