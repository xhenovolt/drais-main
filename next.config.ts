import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // TEMPORARY TECHNICAL DEBT (attendance trust audit, Phase 0):
    // the codebase has pre-existing type errors outside the attendance
    // module, so builds still ignore them. `npm run typecheck` is the
    // required gate — run it in CI / before merging. Attendance-critical
    // files must be type-clean (the audit found a shipped TS2304 in
    // zk-handler that this flag masked). Remove this flag once the
    // backlog of legacy type errors is cleared.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/uploads/students/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
    // Also allow local uploads path
    domains: ['localhost', 'res.cloudinary.com'],
  },

  // ZKTeco ADMS Push Protocol — all /iclock/* traffic → /api/zk-handler
  async rewrites() {
    return [
      {
        source: '/iclock/:path*',
        destination: '/api/zk-handler',
      },
    ];
  },
};

export default nextConfig;
