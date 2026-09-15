/* eslint-disable @next/next/no-img-element -- WebP ya optimizado por scripts/generate-icons.mjs */

/** Logo de LolVault. Decorativo por defecto: siempre va junto al nombre "LolVault" en texto. */
export function AppLogo({ size, className }: { size: number; className?: string }) {
  return (
    <img
      alt=""
      className={className ? `app-logo ${className}` : 'app-logo'}
      decoding="async"
      height={size}
      src="/brand/logo-192.webp"
      width={size}
    />
  );
}
