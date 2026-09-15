'use client';

import { useEffect } from 'react';

export function PushServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error: unknown) => console.warn('[push] No se pudo registrar el service worker.', error));
  }, []);

  return null;
}
