import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next 16 defaults: dynamic-by-default rendering with a prerendered static
  // shell (Cache Components) + partial prefetching for fast navigation
  cacheComponents: true,
  partialPrefetching: true,
  // Don't advertise the framework in response headers (same idea as helmet on the API)
  poweredByHeader: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
