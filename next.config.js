/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE (2026-08): the build now runs on TURBOPACK (`next build --turbopack`).
  // Turbopack compiles in Rust, so compilation memory sits OUTSIDE the V8 heap
  // and --max_old_space_size is no longer the binding constraint. That is the
  // point: this build repeatedly died with "Ineffective mark-compacts near heap
  // limit" at ~2547MB against a 2560MB cap, during the COMPILE phase (the log
  // never reached "Generating static pages").
  //
  // The three flags below are WEBPACK-ONLY and are inert under Turbopack. They
  // are kept so `npm run build:webpack` remains a working rollback path — do not
  // assume they are doing anything for the Vercel build.
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
    cpus: 1,
    // Vercel's build container has 8 GB TOTAL; the compile phase OOM-killed
    // once the app crossed ~660 pages (heap cap only bounds JS, not webpack/
    // SWC native memory). This trades some build speed for bounded memory.
    webpackMemoryOptimizations: true,
    // Run webpack compilation in a dedicated worker process so its (native)
    // memory is released between the client and server compiles instead of
    // accumulating in one process — the lever that actually bounds the peak
    // once the heap cap can no longer help. Keeps the SIGKILL/OOM away.
    webpackBuildWorker: true,
  },

  // Keep puppeteer + the lambda Chromium binary out of the webpack bundle;
  // Next's file tracing ships them as-is so @sparticuz/chromium's brotli
  // binaries reach the Vercel function (see src/lib/pdf/browser.ts).
  // pdfkit belongs here for the same reason as chromium, and leaving it out was
  // why receipt downloads still failed after the tracing include below was
  // added. pdfkit loads its font metrics with
  //     fs.readFileSync(__dirname + '/data/Helvetica.afm')
  // Bundled into the route, `__dirname` becomes the bundle's directory, so the
  // tracer can copy those 15 .afm files into the deployment and pdfkit will
  // still look somewhere else and throw ENOENT. Tracing puts the files on disk;
  // externalising is what keeps `__dirname` pointing at them. Both are needed.
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium', 'pdfkit', 'better-sqlite3'],

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

    // Receipts are built with pdfkit, which reads its Adobe font-metric files
    // (.afm) from disk AT RUNTIME. The static tracer only follows imports, so
    // it never sees those 15 files and they were missing from the deployed
    // function — the route threw before it could return a PDF, which is why
    // receipt downloads failed in production while working locally, where
    // node_modules is simply present.
    //
    // Same class of problem, and same fix, as the @sparticuz/chromium entries
    // above: if a package loads assets via fs rather than import, list them.
    '/api/finance/payments/*/receipt': ['./node_modules/pdfkit/js/data/**'],
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

    // R1 (build-memory): Next emits full `source-map` for the PRODUCTION
    // server compile by default. Turning it off for production (both server +
    // client) trims map-emission memory; only affects stack-trace readability,
    // never runtime behaviour, fully reversible. Dev keeps its fast maps.
    if (!dev) {
      config.devtool = false;
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