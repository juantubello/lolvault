import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieStore: { delete: vi.fn(), set: vi.fn() },
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => mocks.cookieStore,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

import { DEV_USER_COOKIE } from '@/auth/dev-identity';
import { switchDevUserAction } from '@/features/dev/dev-user.actions';

function formWithEmail(email: string): FormData {
  const formData = new FormData();
  formData.set('email', email);
  return formData;
}

describe('switchDevUserAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LOLVAULT_DEV_USER_EMAIL', 'dev@example.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no hace nada en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await switchDevUserAction(formWithEmail('amigo@dev.local'));

    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('en dev guarda el email elegido en la cookie', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await switchDevUserAction(formWithEmail(' Amigo@Dev.Local '));

    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      DEV_USER_COOKIE,
      'amigo@dev.local',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });

  it('con email vacío vuelve al usuario por defecto', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await switchDevUserAction(formWithEmail(''));

    expect(mocks.cookieStore.delete).toHaveBeenCalledWith(DEV_USER_COOKIE);
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });
});
