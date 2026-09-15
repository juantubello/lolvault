import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { kind: 'test-db' },
  deleteAvatarFile: vi.fn(),
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  revalidatePath: vi.fn(),
  setAvatarUpdatedAt: vi.fn(),
  writeAvatarFile: vi.fn(),
}));

vi.mock('@/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb, databasePath: () => './data/test.db' }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/features/profile/profile.queries', () => ({
  setAvatarUpdatedAt: mocks.setAvatarUpdatedAt,
}));
vi.mock('@/features/profile/avatar-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/profile/avatar-storage')>()),
  deleteAvatarFile: mocks.deleteAvatarFile,
  writeAvatarFile: mocks.writeAvatarFile,
}));

import { AVATAR_MAX_BYTES } from '@/config';
import { removeAvatarAction, uploadAvatarAction } from '@/features/profile/avatar.actions';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function formWith(bytes: Uint8Array<ArrayBuffer>, extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'avatar.jpg');
  for (const [key, value] of Object.entries(extra)) formData.set(key, value);
  return formData;
}

describe('uploadAvatarAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.getCurrentUser.mockResolvedValue({ id: 17, displayName: 'Invocador' });
  });

  it('guarda la foto del usuario de la sesión e ignora un userId del form', async () => {
    const result = await uploadAvatarAction(formWith(JPEG, { userId: '999' }));

    expect(result).toEqual({});
    expect(mocks.writeAvatarFile).toHaveBeenCalledExactlyOnceWith(17, JPEG);
    expect(mocks.setAvatarUpdatedAt).toHaveBeenCalledExactlyOnceWith(mocks.db, 17, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rechaza lo que no es JPEG', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

    expect((await uploadAvatarAction(formWith(png))).error).toBeTruthy();
    expect(mocks.writeAvatarFile).not.toHaveBeenCalled();
  });

  it('rechaza archivos más pesados que el límite', async () => {
    const heavy = new Uint8Array(AVATAR_MAX_BYTES + 1);
    heavy.set(JPEG);

    expect((await uploadAvatarAction(formWith(heavy))).error).toBeTruthy();
    expect(mocks.writeAvatarFile).not.toHaveBeenCalled();
  });

  it('sin foto o sin sesión no guarda nada', async () => {
    expect((await uploadAvatarAction(new FormData())).error).toBeTruthy();

    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await uploadAvatarAction(formWith(JPEG))).error).toBeTruthy();

    expect(mocks.writeAvatarFile).not.toHaveBeenCalled();
    expect(mocks.setAvatarUpdatedAt).not.toHaveBeenCalled();
  });
});

describe('removeAvatarAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.getCurrentUser.mockResolvedValue({ id: 17, displayName: 'Invocador' });
  });

  it('limpia la columna y borra el archivo del usuario de la sesión', async () => {
    expect(await removeAvatarAction()).toEqual({});
    expect(mocks.setAvatarUpdatedAt).toHaveBeenCalledExactlyOnceWith(mocks.db, 17, null);
    expect(mocks.deleteAvatarFile).toHaveBeenCalledExactlyOnceWith(17);
  });
});
