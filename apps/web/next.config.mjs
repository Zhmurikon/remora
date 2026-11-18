/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Пакеты монорепо экспортируют исходный TypeScript — Next компилирует их сам.
  transpilePackages: ['@remora/ui', '@remora/core', '@remora/api-client'],
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      {
        source: '/lecture-demo/updates.html',
        destination: '/obnovleniya',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/lecture-demo/:demo(widget|practice).html',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Robots-Tag', value: 'noindex, nosnippet' },
        ],
      },
    ];
  },
};

export default nextConfig;
