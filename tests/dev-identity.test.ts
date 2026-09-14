import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDevIdentity } from '@/auth/dev-identity';

describe('getDevIdentity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('devuelve null en producción aunque el bypass esté configurado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOLVAULT_DEV_USER_EMAIL', 'dev@example.test');

    expect(getDevIdentity()).toBeNull();
  });

  it('en producción ignora la cookie del selector de usuario', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOLVAULT_DEV_USER_EMAIL', 'dev@example.test');

    expect(getDevIdentity(process.env, 'amigo@dev.local')).toBeNull();
  });

  it('en dev usa el email elegido en el selector', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOLVAULT_DEV_USER_EMAIL', 'dev@example.test');

    expect(getDevIdentity(process.env, ' Amigo@Dev.Local ')).toEqual({
      externalIdentity: 'dev:amigo@dev.local',
      email: 'amigo@dev.local',
      source: 'dev',
    });
  });

  it('sin LOLVAULT_DEV_USER_EMAIL no hay modo dev, aunque haya cookie', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOLVAULT_DEV_USER_EMAIL', '');

    expect(getDevIdentity(process.env, 'amigo@dev.local')).toBeNull();
  });

  it('con una cookie inválida vuelve al email por defecto', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOLVAULT_DEV_USER_EMAIL', 'dev@example.test');

    expect(getDevIdentity(process.env, 'no-es-un-email')?.email).toBe('dev@example.test');
  });
});
