/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
    cpus: 1,
    // Vercel's build container has 8 GB TOTAL; the compile phase OOM-killed
    // once the app crossed ~660 pages (heap cap only bounds JS, not webpack/
    // SWC native memory). This trades some build speed for bounded memory.
    webpackMemoryOptimizations: true,
  },

  // Keep puppeteer + the lambda Chromium binary out of the webpack bundle;
  // Next's file tracing ships them as-is so @sparticuz/chromium's brotli
  // binaries reach the Vercel function (see src/lib/pdf/browser.ts).
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium'],

  // @sparticuz/chromium locates its bin/ payload via fs at runtime, which
  // the static tracer cannot see — without these includes the lambda dies
  // with `The input directory ".../@sparticuz/chromium/bin" does not exist`.
  // Keys are micromatch globs against route names; `*` matches a whole
  // segment including literal `[param]` text (avoid brackets in keys — they
  // parse as character classes). Scoped to the PDF routes only so other
  // functions don't carry the ~70MB Chromium payload.
  outputFileTracingIncludes: {
    '/academics/report-cards/*/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/portal/learners/*/snapshots/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/verify/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/students/*/transcript/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/students/full': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
  
  // Turbopack configuration
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  // Don't fail production builds on lint findings (lint runs separately).
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000, // 1 year
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Enable compression
  compress: true,

  // Optimize bundle without the aggressive chunking that can spike memory
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
    }

    return config;
  },

  // Enable static optimization
  output: 'standalone',

  // NOTE: outputFileTracingExcludes was removed — it applied to the Vercel
  // serverless trace too and stripped a module Next needs at runtime
  // ("Cannot find module 'next/dist/compiled/source-map'"). The desktop bundle
  // is slimmed by electron-builder's `files`/extraResources filters instead, so
  // a global trace exclude is unnecessary here and unsafe on Vercel.

  // Optimize headers for static assets
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          // SAMEORIGIN (not DENY) so the report-card preview iframe in
          // SnapshotPreviewer and DRCE side panels can embed pages from
          // the same deployment. Cross-origin embedding is still blocked.
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          // Modern browsers honour CSP frame-ancestors over X-Frame-Options.
          // 'self' matches SAMEORIGIN; tighten or relax centrally here.
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self'"
          }
        ],
      },
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
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

module.exports = nextConfig;