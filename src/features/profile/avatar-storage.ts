/** Fotos de perfil en disco, en el mismo volumen que la base: `<dir de la DB>/avatars/<userId>.jpg`. */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { databasePath } from '@/db/client';

export function avatarsDir(): string {
  return join(dirname(resolve(databasePath())), 'avatars');
}

/** El nombre del archivo sale solo de un id entero: no hay forma de armar un path arbitrario. */
function fileFor(dir: string, userId: number): string {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error(`userId de avatar inválido: ${userId}`);
  return join(dir, `${userId}.jpg`);
}

/** Firma de JPEG (FF D8 FF). El cliente siempre convierte a JPEG antes de subir. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function writeAvatarFile(
  userId: number,
  bytes: Uint8Array,
  dir: string = avatarsDir(),
): Promise<void> {
  const target = fileFor(dir, userId);
  await mkdir(dir, { recursive: true });

  // Escribir a un temporal y renombrar es atómico: nadie lee una foto a medio escribir.
  const temp = `${target}.${process.pid}-${Date.now()}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, target);
}

export async function readAvatarFile(
  userId: number,
  dir: string = avatarsDir(),
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return new Uint8Array(await readFile(fileFor(dir, userId)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function deleteAvatarFile(userId: number, dir: string = avatarsDir()): Promise<void> {
  await rm(fileFor(dir, userId), { force: true });
}
