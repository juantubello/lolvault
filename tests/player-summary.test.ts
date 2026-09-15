import { describe, expect, it } from 'vitest';

import { isRemake, kdaRatio, summarizeMatches } from '@/features/matches/player-summary';
import type { PlayerMatchSummary } from '@/features/matches/types';

let nextId = 0;

function match(overrides: Partial<PlayerMatchSummary>): PlayerMatchSummary {
  nextId += 1;
  return {
    matchId: `m${nextId}`,
    playedAt: new Date('2026-09-14T21:00:00Z'),
    queue: 'FLEXRANKED',
    durationSeconds: 1800,
    puuid: 'puuid-invocador',
    championId: 90,
    championName: 'Malzahar',
    position: 'MID',
    teamKey: 'BLUE',
    kills: 0,
    deaths: 0,
    assists: 0,
    championLevel: 16,
    cs: 200,
    damageDealt: 20000,
    damageTaken: 18000,
    teamKills: 20,
    win: true,
    result: 'WIN',
    opScore: 5,
    opScoreRank: 5,
    ...overrides,
  };
}

describe('summarizeMatches', () => {
  const matches = [
    match({ kills: 7, deaths: 6, assists: 5, teamKills: 26, win: true }),
    match({ championId: 25, championName: 'Morgana', position: 'SUPPORT', kills: 0, deaths: 5, assists: 3, teamKills: 11, win: false }),
    match({ kills: 5, deaths: 5, assists: 7, teamKills: 18, win: false }),
    // Remake de 4 minutos: no cuenta para nada (OP.GG muestra 20G con 21 partidas jugadas).
    match({ championId: 1, championName: 'Annie', durationSeconds: 262, kills: 1, deaths: 1, win: true }),
  ];

  it('cuenta victorias y derrotas sin remakes', () => {
    const summary = summarizeMatches(matches);
    expect(summary).toMatchObject({ games: 3, wins: 1, losses: 2 });
    expect(summary.winRate).toBeCloseTo(1 / 3);
  });

  it('calcula promedios, KDA y participación en kills', () => {
    const summary = summarizeMatches(matches);
    expect(summary.avgKills).toBeCloseTo(4);
    expect(summary.avgDeaths).toBeCloseTo(16 / 3);
    expect(summary.kda).toBeCloseTo((12 + 15) / 16);
    expect(summary.killParticipation).toBeCloseTo((12 + 15) / 55);
  });

  it('ordena los campeones por partidas y arma los roles', () => {
    const summary = summarizeMatches(matches);
    expect(summary.topChampions.map((c) => [c.championName, c.games, c.wins, c.losses])).toEqual([
      ['Malzahar', 2, 1, 1],
      ['Morgana', 1, 0, 1],
    ]);
    expect(summary.roles).toEqual([
      { position: 'MID', games: 2 },
      { position: 'SUPPORT', games: 1 },
    ]);
  });

  it('sin partidas no divide por cero', () => {
    expect(summarizeMatches([])).toMatchObject({ games: 0, winRate: 0, killParticipation: 0, kda: null });
  });
});

describe('helpers', () => {
  it('KDA perfecto sin muertes es null', () => {
    expect(kdaRatio(3, 0, 4)).toBeNull();
    expect(kdaRatio(7, 6, 5)).toBe(2);
  });

  it('una partida de menos de 5 minutos es remake', () => {
    expect(isRemake({ durationSeconds: 262 })).toBe(true);
    expect(isRemake({ durationSeconds: 1099 })).toBe(false);
  });
});
