import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LolVault',
    short_name: 'LolVault',
    description: 'Vaults de campeones para partidas entre amigos.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F2F2F7',
    theme_color: '#F2F2F7',
    icons: [
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
