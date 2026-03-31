export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

/**
 * GET /api/cloudinary/status
 * Server-side check for Cloudinary connectivity.
 * Returns { connected: true|false, message: string }
 * Never throws — always returns 200 with status field.
 */
export async function GET() {
  const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey     = process.env.CLOUDINARY_API_KEY;
  const apiSecret  = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({
      success: true,
      connected: false,
      message: 'Cloudinary env vars not configured',
    });
  }

  try {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    // Ping: list root folder (fast, minimal data)
    await cloudinary.api.ping();
    return NextResponse.json({
      success: true,
      connected: true,
      message: 'Cloudinary connected',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: true,
      connected: false,
      message: error?.message || 'Cloudinary connection failed',
    });
  }
}
