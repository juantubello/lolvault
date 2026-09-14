import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LolVault',
    template: '%s · LolVault',
  },
  description: 'Vaults de campeones para partidas entre amigos.',
  applicationName: 'LolVault',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LolVault',
  },
  icons: {
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
