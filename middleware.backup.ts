// Minimal test middleware to verify middleware execution
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Write to response headers to prove middleware ran
  const response = NextResponse.next();
  response.headers.set('x-middleware-ran', 'true');
  response.headers.set('x-path', request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: ['/:path*'],
};
