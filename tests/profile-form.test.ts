import { describe, expect, it } from 'vitest';

import { formatRiotId, validateProfile } from '@/features/profile/profile-form';

describe('validateProfile', () => {
  it('separa nombre y tag del Riot ID', () => {
    expect(validateProfile({ displayName: 'Invocador', riotId: 'Faker Jr#1234' })).toEqual({
      ok: true,
      profile: { displayName: 'Invocador', riotGameName: 'Faker Jr', riotTagLine: '1234' },
    });
  });

  it('permite dejar el Riot ID vacío', () => {
    expect(validateProfile({ displayName: 'Invocador', riotId: '' })).toEqual({
      ok: true,
      profile: { displayName: 'Invocador', riotGameName: null, riotTagLine: null },
    });
  });

  it('rechaza un Riot ID sin tag', () => {
    const result = validateProfile({ displayName: 'Invocador', riotId: 'sinhashtag' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors.riotId).toBeTruthy();
  });

  it('exige el nombre', () => {
    const result = validateProfile({ displayName: '', riotId: '' });
    expect(!result.ok && result.fieldErrors.displayName).toBeTruthy();
  });
});

describe('formatRiotId', () => {
  it('arma gameName#tagLine o vacío si falta alguno', () => {
    expect(formatRiotId('Faker Jr', '1234')).toBe('Faker Jr#1234');
    expect(formatRiotId(null, null)).toBe('');
  });
});
