import { describe, expect, it } from 'vitest';

import {
  formatDuration,
  formatKda,
  formatPercent,
  positionLabel,
  queueLabel,
  rankLabel,
  timeAgo,
} from '@/features/matches/format';

describe('formatos de partidas', () => {
  it('traduce colas y roles, con fallback legible', () => {
    expect(queueLabel('FLEXRANKED')).toBe('Flex');
    expect(queueLabel('ULTBOOK')).toBe('Ultbook');
    expect(positionLabel('JUNGLE')).toBe('Jungla');
  });

  it('arma el rango con división salvo en Maestro o más', () => {
    const base = { queue: 'FLEXRANKED', lp: 93, wins: 55, losses: 52, tierImageUrl: null };
    expect(rankLabel({ ...base, tier: 'PLATINUM', division: 4 })).toBe('Platino 4');
    expect(rankLabel({ ...base, tier: 'MASTER', division: 1 })).toBe('Maestro');
    expect(rankLabel({ ...base, tier: null, division: null })).toBeNull();
  });

  it('formatea KDA, porcentaje y duración', () => {
    expect(formatKda(2.4137)).toBe('2,41');
    expect(formatKda(null)).toBe('Perfecto');
    expect(formatPercent(0.4737)).toBe('47%');
    expect(formatDuration(2220)).toBe('37:00');
    expect(formatDuration(262)).toBe('4:22');
  });

  it('dice hace cuánto fue', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    expect(timeAgo(new Date('2026-09-15T11:48:00Z'), now)).toBe('hace 12 min');
    expect(timeAgo(new Date('2026-09-15T07:00:00Z'), now)).toBe('hace 5 h');
    expect(timeAgo(new Date('2026-09-13T12:00:00Z'), now)).toBe('hace 2 d');
  });
});
