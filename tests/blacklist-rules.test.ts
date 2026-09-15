import { describe, expect, it } from 'vitest';

import { VOTING_WINDOW_MS } from '@/config';
import {
  blacklistClosesAt,
  blacklistVoteOutcome,
  blacklistVotingStatus,
  dedupeKey,
  isBlacklistEntryActive,
  normalizeBlacklistName,
  validateBlacklistRiotId,
} from '@/features/blacklist/blacklist-rules';

const NOW = new Date('2026-09-15T12:00:00Z');

describe('reglas de black list', () => {
  it('aprueba con dos votos y rechaza cuando los miembros restantes no alcanzan', () => {
    expect(blacklistVoteOutcome({ yes: 2, no: 3, eligibleVoters: 6 })).toBe('approved');
    expect(blacklistVoteOutcome({ yes: 1, no: 3, eligibleVoters: 5 })).toBe('open');
    expect(blacklistVoteOutcome({ yes: 1, no: 4, eligibleVoters: 5 })).toBe('rejected');
  });

  it('vence exactamente a las 48 horas y prioriza cancelación', () => {
    const timeline = {
      closesAt: blacklistClosesAt(NOW),
      approvedAt: null,
      rejectedAt: null,
      cancelledAt: null,
    };
    expect(timeline.closesAt.getTime() - NOW.getTime()).toBe(VOTING_WINDOW_MS);
    expect(blacklistVotingStatus(timeline, new Date(timeline.closesAt.getTime() - 1))).toBe('open');
    expect(blacklistVotingStatus(timeline, timeline.closesAt)).toBe('expired');
    expect(blacklistVotingStatus({ ...timeline, cancelledAt: NOW }, NOW)).toBe('cancelled');
  });

  it('solo considera vigente un add aprobado y no removido', () => {
    expect(isBlacklistEntryActive({ kind: 'add', approvedAt: NOW, removedAt: null })).toBe(true);
    expect(isBlacklistEntryActive({ kind: 'add', approvedAt: NOW, removedAt: NOW })).toBe(false);
    expect(isBlacklistEntryActive({ kind: 'remove', approvedAt: NOW, removedAt: null })).toBe(false);
  });

  it('normaliza nombres y Riot IDs para deduplicar', () => {
    expect(normalizeBlacklistName('  Álvaro   Núñez ')).toBe('alvaro nunez');
    expect(dedupeKey('Ignorado', { gameName: 'JuGaDor', tagLine: 'LaS' })).toBe(
      'riot:jugador#las',
    );
    expect(dedupeKey('  Álvaro   Núñez ', null)).toBe('name:alvaro nunez');
  });

  it('reutiliza la validación de Riot ID de Perfil', () => {
    expect(validateBlacklistRiotId('Jugador#LAS')).toEqual({
      ok: true,
      riotId: { gameName: 'Jugador', tagLine: 'LAS' },
    });
    expect(validateBlacklistRiotId('sin-tag').ok).toBe(false);
    expect(validateBlacklistRiotId('')).toEqual({ ok: true, riotId: null });
  });
});
