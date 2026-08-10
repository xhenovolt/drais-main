/**
 * RETIRED — unauthenticated request forwarder, removed in the Phase 1
 * authorization hardening.
 *
 * WHAT IT WAS
 * -----------
 * A catch-all that forwarded GET/POST/PUT/PATCH/DELETE — method, query string
 * and body — to `NEXT_PUBLIC_PHP_API_BASE` (default `http://localhost/drais/api`),
 * from the PHP-backend era. It performed NO authentication, NO session check,
 * NO tenant check and NO permission check, on any method. Its own header
 * comment said "in production you may add authentication" — that never happened.
 *
 * WHY IT IS SAFE TO RETIRE
 * ------------------------
 * Measured before removal: zero callers anywhere in `src/` or `electron/`. The
 * components that still speak to the PHP backend do NOT route through here —
 * they call `NEXT_PUBLIC_PHP_API_BASE` directly from the browser.
 *
 * WHY IT WAS RETIRED RATHER THAN GATED
 * ------------------------------------
 * An unauthenticated forwarder is an authorization hole by construction: it
 * grants whatever the destination grants. Adding a session check to dead code
 * keeps the hazard and gains nothing. 410 matches the pattern already used for
 * the retired finance and tahfiz write paths, so any caller that appears later
 * fails loudly instead of silently reaching an unauthenticated proxy.
 *
 * If a PHP bridge is ever needed again, build it as a named route with the
 * standard chain: session → tenant → permission → validate → forward → audit.
 */
import { NextResponse } from 'next/server';

const GONE = () =>
  NextResponse.json(
    {
      error:
        'Endpoint removed. The unauthenticated PHP proxy was retired in the Phase 1 authorization hardening.',
      code: 'GONE',
    },
    { status: 410 },
  );

export async function GET()    { return GONE(); }
export async function POST()   { return GONE(); }
export async function PUT()    { return GONE(); }
export async function PATCH()  { return GONE(); }
export async function DELETE() { return GONE(); }
