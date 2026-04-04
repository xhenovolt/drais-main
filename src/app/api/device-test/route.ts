/**
 * Direct Device Test API
 * POST /api/device-test
 * 
 * Quick connectivity test to any device URL on the network.
 * No database or session-based config required — just supply a URL.
 * Optionally provide username/password for Basic auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // Require authentication
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, username, password, timeout: timeoutMs } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ success: false, error: 'url is required' }, { status: 400 });
  }

  // Validate the URL is a proper HTTP/HTTPS URL
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ success: false, error: 'Only http and https URLs are allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid URL format' }, { status: 400 });
  }

  // Block requests to loopback / metadata endpoints
  const hostname = parsed.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('169.254.')
  ) {
    return NextResponse.json({ success: false, error: 'Loopback and link-local addresses are not allowed' }, { status: 400 });
  }

  const effectiveTimeout = Math.min(Math.max(Number(timeoutMs) || 10000, 2000), 30000);
  const startTime = Date.now();

  const result: {
    success: boolean;
    message: string;
    statusCode: number | null;
    responseTimeMs: number;
    headers: Record<string, string>;
    bodyPreview: string;
    contentLength: number | null;
  } = {
    success: false,
    message: '',
    statusCode: null,
    responseTimeMs: 0,
    headers: {},
    bodyPreview: '',
    contentLength: null,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    const headers: Record<string, string> = {
      'Accept': '*/*',
    };

    if (username) {
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password || ''}`).toString('base64')}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    result.responseTimeMs = Date.now() - startTime;
    result.statusCode = response.status;

    // Capture response headers
    const importantHeaders = ['content-type', 'server', 'www-authenticate', 'content-length', 'x-powered-by'];
    for (const h of importantHeaders) {
      const val = response.headers.get(h);
      if (val) result.headers[h] = val;
    }

    // Read body
    const text = await response.text();
    result.contentLength = text.length;
    result.bodyPreview = text.substring(0, 2000);

    if (response.ok) {
      result.success = true;
      result.message = `Device responded with ${response.status} OK`;
    } else if (response.status === 401) {
      result.success = true;
      result.message = `Device reachable — returned 401 (auth required). ${username ? 'Credentials may be wrong.' : 'Try providing username/password.'}`;
    } else if (response.status === 403) {
      result.success = true;
      result.message = `Device reachable — returned 403 Forbidden`;
    } else {
      result.success = false;
      result.message = `Device returned HTTP ${response.status}`;
    }
  } catch (err: any) {
    result.responseTimeMs = Date.now() - startTime;

    if (err.name === 'AbortError') {
      result.message = `Connection timeout after ${effectiveTimeout}ms — device may be unreachable`;
    } else if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      result.message = 'Connection refused — verify IP and port';
    } else if (err.cause?.code === 'ENOTFOUND' || err.message?.includes('ENOTFOUND')) {
      result.message = 'Host not found — verify the address';
    } else if (err.cause?.code === 'EHOSTUNREACH' || err.message?.includes('EHOSTUNREACH')) {
      result.message = 'Host unreachable — device may be offline or on a different network';
    } else if (err.cause?.code === 'ETIMEDOUT' || err.message?.includes('ETIMEDOUT')) {
      result.message = 'Connection timed out — device may be offline';
    } else {
      result.message = err.message || 'Connection failed';
    }
  }

  return NextResponse.json(result);
}
