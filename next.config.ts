import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'web-push'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Detrás del túnel de Cloudflare el Host llega igual al origen, pero si algún día se
      // setea httpHostHeader en el ingress, Next rechazaría las Server Actions por CSRF.
      allowedOrigins: ['lolvault.casapipis.net'],
    },
  },
  images: {
    // Fotos de campeones de Data Dragon. Se sirven con `unoptimized` (ya vienen chicas):
    // así el homelab no gasta CPU re-encodeando 170 imágenes.
    remotePatterns: [
      { protocol: 'https', hostname: 'ddragon.leagueoflegends.com', pathname: '/cdn/**' },
    ],
  },
};

export default nextConfig;
