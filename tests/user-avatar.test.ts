import { describe, expect, it } from 'vitest';

import {
  AVATAR_COLOR_COUNT,
  avatarColorIndex,
  avatarInitials,
} from '../src/components/user-avatar-helpers';

describe('avatarInitials', () => {
  it('usa hasta las dos primeras palabras', () => {
    expect(avatarInitials('Juan Pérez')).toBe('JP');
    expect(avatarInitials('  ana   maría sol  ')).toBe('AM');
  });

  it('soporta un nombre, Unicode y nombres vacíos', () => {
    expect(avatarInitials('élise')).toBe('É');
    expect(avatarInitials('')).toBe('?');
    expect(avatarInitials('   ')).toBe('?');
  });
});

describe('avatarColorIndex', () => {
  it('es determinístico y normaliza mayúsculas', () => {
    expect(avatarColorIndex('Amigo Uno')).toBe(avatarColorIndex('amigo uno'));
    expect(avatarColorIndex(42)).toBe(avatarColorIndex(42));
  });

  it('siempre devuelve un índice válido de la paleta', () => {
    for (const identity of [1, 2, 'Juancito', 'Martín', '']) {
      expect(avatarColorIndex(identity)).toBeGreaterThanOrEqual(0);
      expect(avatarColorIndex(identity)).toBeLessThan(AVATAR_COLOR_COUNT);
    }
  });
});
