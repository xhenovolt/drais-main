/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
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

  // Optimize bundle
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Tree shaking optimization
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      
      // Split chunks for better caching
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          vendor: {
            chunks: 'all',
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            enforce: true,
          },
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            enforce: true,
          },
        },
      };
    }

    return config;
  },

  // Enable static optimization
  output: 'standalone',
  
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