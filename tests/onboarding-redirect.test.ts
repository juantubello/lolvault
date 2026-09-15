import { describe, expect, it } from 'vitest';

import { onboardingRedirectFor } from '@/auth/onboarding-redirect';
import type { User } from '@/db/schema';

function user(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    externalIdentity: 'dev:dev@example.test',
    email: 'dev@example.test',
    displayName: null,
    riotGameName: null,
    riotTagLine: null,
    riotPuuid: null,
    avatarChampionId: null,
    avatarUpdatedAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

describe('onboardingRedirectFor', () => {
  it('envía a onboarding a un usuario nuevo sin display_name', () => {
    expect(onboardingRedirectFor(user())).toBe('/onboarding');
  });

  it('deja entrar al usuario que ya completó su perfil', () => {
    expect(onboardingRedirectFor(user({ displayName: 'Invocador' }))).toBeNull();
  });
});
