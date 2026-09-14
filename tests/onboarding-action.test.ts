import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { kind: 'test-db' },
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  saveProfile: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
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

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

import { completeOnboardingAction } from '@/app/onboarding/actions';

describe('completeOnboardingAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.getCurrentUser.mockResolvedValue({ id: 17 });
  });

  it('ignora cualquier userId del formulario y usa el usuario autenticado', async () => {
    const formData = new FormData();
    formData.set('userId', '999');
    formData.set('displayName', 'Invocador');
    formData.set('riotId', 'Jugador#LAS');

    await completeOnboardingAction({}, formData);

    expect(mocks.saveProfile).toHaveBeenCalledOnce();
    expect(mocks.saveProfile).toHaveBeenCalledWith(mocks.db, 17, {
      displayName: 'Invocador',
      riotGameName: 'Jugador',
      riotTagLine: 'LAS',
    });
    expect(mocks.saveProfile).not.toHaveBeenCalledWith(
      mocks.db,
      999,
      expect.anything(),
    );
  });

  it('devuelve lo que escribió el usuario cuando falla la validación', async () => {
    const formData = new FormData();
    formData.set('displayName', 'Invocador');
    formData.set('riotId', 'sinhashtag');

    const state = await completeOnboardingAction({}, formData);

    expect(state.fieldErrors?.riotId).toBeDefined();
    expect(state.values).toEqual({ displayName: 'Invocador', riotId: 'sinhashtag' });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });
});
