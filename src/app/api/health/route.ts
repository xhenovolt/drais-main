/**
 * GET /api/health — boot/diagnostics probe for the packaged desktop app
 * (and any deploy). Reports server liveness + DB connectivity + which config
 * is present (secrets masked). The Electron shell polls this before opening the
 * window, and the diagnostic screen renders it when something is wrong.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const env = {
    tidb_host_set: !!process.env.TIDB_HOST,
    tidb_user_set: !!process.env.TIDB_USER,
    tidb_password_set: !!process.env.TIDB_PASSWORD,
    tidb_db: process.env.TIDB_DB || 'drais',
    node_env: process.env.NODE_ENV || null,
    config_source: process.env.DRAIS_CONFIG_SOURCE || null, // set by electron/config.cjs
  };

  let db: { connected: boolean; error?: string; latency_ms?: number } = { connected: false };
  const t0 = Date.now();
  try {
    await query('SELECT 1 AS ok');
    db = { connected: true, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    // Mask anything credential-shaped from the error message.
    const raw = e?.message || String(e);
    db = { connected: false, error: raw.replace(/(password|user)=([^\s;]+)/gi, '$1=***').slice(0, 300) };
  }

  const ok = db.connected;
  return NextResponse.json(
    {
      ok,
      server: true,
      db,
      env,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
