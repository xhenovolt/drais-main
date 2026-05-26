import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export interface PlatformError {
  code:    string;
  message: string;
  details?: unknown;
}

function baseHeaders(requestId: string, extra?: Record<string, string>) {
  return {
    'Content-Type':  'application/json; charset=utf-8',
    'X-Request-Id':  requestId,
    'X-Api-Version': 'v1',
    'Cache-Control': 'no-store',
    ...extra,
  };
}

export function newRequestId(): string { return randomUUID(); }

export function ok<T>(data: T, requestId: string, extra?: Record<string, string>) {
  return new NextResponse(JSON.stringify({ success: true, data }), {
    status:  200,
    headers: baseHeaders(requestId, extra),
  });
}

export function created<T>(data: T, requestId: string, extra?: Record<string, string>) {
  return new NextResponse(JSON.stringify({ success: true, data }), {
    status:  201,
    headers: baseHeaders(requestId, extra),
  });
}

export function fail(status: number, error: PlatformError, requestId: string, extra?: Record<string, string>) {
  return new NextResponse(JSON.stringify({ success: false, error }), {
    status,
    headers: baseHeaders(requestId, extra),
  });
}

export const Errors = {
  unauthorized:  (msg = 'Unauthorized')           => ({ code: 'UNAUTHORIZED', message: msg }),
  forbidden:     (msg = 'Forbidden')              => ({ code: 'FORBIDDEN', message: msg }),
  notFound:      (msg = 'Not found')              => ({ code: 'NOT_FOUND', message: msg }),
  badRequest:    (msg: string, details?: unknown) => ({ code: 'BAD_REQUEST', message: msg, details }),
  conflict:      (msg: string)                    => ({ code: 'CONFLICT', message: msg }),
  rateLimited:   (msg = 'Rate limit exceeded')    => ({ code: 'RATE_LIMITED', message: msg }),
  serverError:   (msg = 'Internal error')         => ({ code: 'SERVER_ERROR', message: msg }),
  notConfigured: (msg = 'Server misconfigured')   => ({ code: 'SERVER_MISCONFIGURATION', message: msg }),
};
