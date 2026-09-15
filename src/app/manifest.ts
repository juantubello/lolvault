import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LolVault',
    short_name: 'LolVault',
    description: 'Vaults de campeones para partidas entre amigos.',
    start_url: '/',
    display: 'standalone',
    // Mismo azul noche del logo: la splash de Android no hace un flash claro antes de la app.
    background_color: '#05060f',
    theme_color: '#05060f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
