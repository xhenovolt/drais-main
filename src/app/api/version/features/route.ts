/**
 * GET /api/version/features
 * Active (non-expired) New/Improved/Updated feature flags from the static
 * manifest. UI (sidebar, route headers) fetches this to show badges.
 */
import { NextResponse } from 'next/server';
import { activeFeatureFlags } from '@/lib/version/feature-manifest';
import pkg from '../../../../../package.json';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ success: true, version: pkg.version, flags: activeFeatureFlags() });
}
