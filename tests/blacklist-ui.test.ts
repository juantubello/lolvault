import { describe, expect, it } from 'vitest';

import {
  formatKnownPlayerMembers,
  formatKnownPlayerSuggestion,
  mergeVotingCards,
} from '@/features/blacklist/blacklist-ui';

describe('UI de black list', () => {
  it('describe coincidencias sin hardcodear integrantes y llama vos al viewer', () => {
    const now = new Date('2026-09-15T15:00:00.000Z');
    expect(formatKnownPlayerMembers([
      { id: 7, displayName: 'Juan' },
      { id: 2, displayName: 'Cami' },
    ], 7)).toBe('Cami y vos');

    expect(formatKnownPlayerSuggestion({
      sharedMatches: 3,
      lastPlayedAt: new Date('2026-09-12T15:00:00.000Z'),
      members: [
        { id: 7, displayName: 'Juan' },
        { id: 2, displayName: 'Cami' },
      ],
    }, 7, now)).toBe('3 partidas con Cami y vos · hace 3 d');
  });

  it('usa una descripción genérica si el detalle no identifica al miembro', () => {
    expect(formatKnownPlayerMembers([], 7)).toBe('el grupo');
  });

  it('mezcla vaults y black list por fecha en ambos sentidos', () => {
    const vaults = [
      { id: 'v1', createdAt: new Date('2026-09-15T10:00:00.000Z') },
      { id: 'v2', createdAt: new Date('2026-09-15T12:00:00.000Z') },
    ];
    const blacklist = [
      { id: 'b1', createdAt: new Date('2026-09-15T11:00:00.000Z') },
    ];

    expect(mergeVotingCards(vaults, blacklist, 'oldest').map(({ type, card }) => `${type}:${card.id}`))
      .toEqual(['vault:v1', 'blacklist:b1', 'vault:v2']);
    expect(mergeVotingCards(vaults, blacklist, 'newest').map(({ type, card }) => `${type}:${card.id}`))
      .toEqual(['vault:v2', 'blacklist:b1', 'vault:v1']);
  });
});
