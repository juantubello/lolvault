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
});
