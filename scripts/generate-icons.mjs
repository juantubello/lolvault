// Genera los íconos de la PWA a partir del logo (1024×1024) en design-system/lolvault/brand/.
// Uso: node scripts/generate-icons.mjs
import { mkdir } from 'node:fs/promises';

import sharp from 'sharp';

const SOURCE = 'design-system/lolvault/brand/logo-1024.jpg';
// El arte trae esquinas redondeadas en negro: se recorta un poco el borde para que el ícono sea
// full-bleed y la máscara del sistema (iOS/Android) redondee sin dejar esquinas oscuras raras.
const CROP_INSET = 28;
const BACKGROUND = '#05060f';

const source = sharp(SOURCE);
const { width, height } = await source.metadata();
const cropped = await source
  .extract({ left: CROP_INSET, top: CROP_INSET, width: width - CROP_INSET * 2, height: height - CROP_INSET * 2 })
  .flatten({ background: BACKGROUND })
  .png()
  .toBuffer();

async function square(size, file) {
  await sharp(cropped).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
}

await mkdir('public/icons', { recursive: true });
await square(192, 'public/icons/icon-192.png');
await square(512, 'public/icons/icon-512.png');
await square(180, 'src/app/apple-icon.png');
await square(64, 'src/app/icon.png');

// Logo dentro de la app (sidebar, onboarding, Acerca de): WebP liviano, 2x del mayor tamaño usado.
await mkdir('public/brand', { recursive: true });
await sharp(cropped).resize(192, 192).webp({ quality: 82 }).toFile('public/brand/logo-192.webp');

// Maskable (Android): el contenido tiene que entrar en el círculo seguro del 80 %.
const inner = Math.round(512 * 0.8);
await sharp({ create: { width: 512, height: 512, channels: 3, background: BACKGROUND } })
  .composite([{ input: await sharp(cropped).resize(inner, inner).png().toBuffer(), gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile('public/icons/icon-maskable-512.png');

console.log('Íconos generados.');
