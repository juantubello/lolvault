import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { DevUserSwitcher } from '@/components/dev-user-switcher';

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
    // Extensiones del navegador (ej. LanguageTool: data-lt-installed) tocan <html> antes de React.
    // Solo silencia atributos de este elemento; los errores de hydration de la app se siguen viendo.
    <html lang="es" suppressHydrationWarning>
      <body>
        {children}
        <DevUserSwitcher />
      </body>
    </html>
  );
}
