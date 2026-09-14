import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { kind: 'test-db' },
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  saveProfile: vi.fn(),
}));

vi.mock('@/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@/db/client', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/features/profile/profile.queries', () => ({
  saveProfile: mocks.saveProfile,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

import { updateProfileAction } from '@/app/(app)/perfil/editar/actions';

describe('updateProfileAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.getCurrentUser.mockResolvedValue({ id: 17 });
  });

  it('guarda el Riot ID nuevo solo para el usuario autenticado', async () => {
    const formData = new FormData();
    formData.set('userId', '999');
    formData.set('displayName', 'Invocador');
    formData.set('riotId', 'NombreNuevo#LAS');

    await updateProfileAction({}, formData);

    expect(mocks.saveProfile).toHaveBeenCalledExactlyOnceWith(mocks.db, 17, {
      displayName: 'Invocador',
      riotGameName: 'NombreNuevo',
      riotTagLine: 'LAS',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(mocks.redirect).toHaveBeenCalledWith('/perfil');
  });

  it('no guarda y conserva lo escrito si el Riot ID es inválido', async () => {
    const formData = new FormData();
    formData.set('displayName', 'Invocador');
    formData.set('riotId', 'malo');

    const state = await updateProfileAction({}, formData);

    expect(state.fieldErrors?.riotId).toBeDefined();
    expect(state.values).toEqual({ displayName: 'Invocador', riotId: 'malo' });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
