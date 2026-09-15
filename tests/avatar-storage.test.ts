import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteAvatarFile,
  isJpeg,
  readAvatarFile,
  writeAvatarFile,
} from '@/features/profile/avatar-storage';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const OTHER_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 9, 9]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lolvault-avatars-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isJpeg', () => {
  it('reconoce la firma de JPEG y rechaza el resto', () => {
    expect(isJpeg(JPEG)).toBe(true);
    expect(isJpeg(PNG)).toBe(false);
    expect(isJpeg(new Uint8Array())).toBe(false);
  });
});

describe('archivo de avatar', () => {
  it('escribe, lee y reemplaza la foto sin dejar temporales', async () => {
    await writeAvatarFile(7, JPEG, dir);
    await writeAvatarFile(7, OTHER_JPEG, dir);

    expect(await readAvatarFile(7, dir)).toEqual(OTHER_JPEG);
    expect(await readdir(dir)).toEqual(['7.jpg']);
  });

  it('devuelve null si no hay foto y borrar dos veces no falla', async () => {
    expect(await readAvatarFile(8, dir)).toBeNull();

    await writeAvatarFile(8, JPEG, dir);
    await deleteAvatarFile(8, dir);
    await deleteAvatarFile(8, dir);

    expect(await readAvatarFile(8, dir)).toBeNull();
  });

  it('no arma paths con ids que no son enteros positivos', async () => {
    await expect(writeAvatarFile(-1, JPEG, dir)).rejects.toThrow();
    await expect(readAvatarFile(Number('../1'), dir)).rejects.toThrow();
    await expect(deleteAvatarFile(1.5, dir)).rejects.toThrow();
  });
});
