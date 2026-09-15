import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  images: {
    // Fotos de campeones de Data Dragon. Se sirven con `unoptimized` (ya vienen chicas):
    // así el homelab no gasta CPU re-encodeando 170 imágenes.
    remotePatterns: [
      { protocol: 'https', hostname: 'ddragon.leagueoflegends.com', pathname: '/cdn/**' },
    ],
  },
};

export default nextConfig;
