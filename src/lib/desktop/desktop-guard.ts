/**
 * "Did this request come from the DRAIS window on this computer?"
 *
 * The desktop app's server listens on 0.0.0.0 so attendance devices and other
 * computers on the school network can reach it. A few local-only actions —
 * installing/replacing the school database, switching database mode — must not
 * be reachable from those other machines, and they run before anyone is signed
 * in, so a session cannot be the check.
 *
 * electron/main.cjs generates a random token per launch, hands it to the
 * in-process server as DRAIS_DESKTOP_TOKEN, and adds it as the
 * `x-drais-desktop` header to every request its own window sends to the
 * local server. Another device never sees it. Client IP and Host headers are
 * not used: both are set by the caller.
 *
 * Outside the desktop app (DRAIS_DESKTOP_TOKEN unset: `next dev`, a plain local
 * server) behaviour is unchanged.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const DESKTOP_HEADER = 'x-drais-desktop';

export function isFromDesktopWindow(req: NextRequest): boolean {
  const expected = process.env.DRAIS_DESKTOP_TOKEN;
  if (!expected) return true;
  const got = req.headers.get(DESKTOP_HEADER) || '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** null when allowed; otherwise the 403 to return. */
export function requireDesktopWindow(req: NextRequest): NextResponse | null {
  if (isFromDesktopWindow(req)) return null;
  return NextResponse.json(
    { error: 'This action is only available in the DRAIS app on the computer that holds the school database.', code: 'DESKTOP_ONLY' },
    { status: 403 },
  );
}
