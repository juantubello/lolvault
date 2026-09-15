import manifest from './manifest-data';

// Route handler en vez de app/manifest.ts: así Next no inyecta su propio <link rel="manifest">
// (sin crossOrigin) y el del layout, con use-credentials, es el único.
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(JSON.stringify(manifest()), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
