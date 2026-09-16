import { describe, expect, it } from 'vitest';

import {
  compareRecentToSeason,
  normalizeRankedChampion,
  summarizeScoutMatches,
} from '@/features/scout/scout-metrics';
import type { PlayerMatchSummary, RankedSeasonChampion } from '@/features/matches/types';

let nextId = 0;

function match(overrides: Partial<PlayerMatchSummary> = {}): PlayerMatchSummary {
  nextId += 1;
  return {
    matchId: `metric-${nextId}`,
    playedAt: new Date('2026-09-12T03:30:00Z'), // Sábado 00:30 en Buenos Aires.
    queue: 'SOLORANKED',
    durationSeconds: 1800,
    puuid: 'puuid-falso',
    championId: 1,
    championName: 'Annie',
    position: 'MID',
    teamKey: 'BLUE',
    kills: 5,
    deaths: 2,
    assists: 5,
    championLevel: 16,
    cs: 180,
    damageDealt: 18_000,
    damageTaken: 12_000,
    teamKills: 20,
    win: true,
    result: 'WIN',
    opScore: 6,
    opScoreRank: 3,
    ...overrides,
  };
}

function rankedChampion(): RankedSeasonChampion {
  return {
    championId: 1,
    championName: 'Annie',
    games: 10,
    wins: 6,
    losses: 4,
    durationSeconds: 18_000,
    basic: {
      kills: 50, deaths: 20, assists: 70, killParticipation: 4.8,
      damageToChampion: 200_000, damageParticipation: 2.6, damageDistribution: 1.4,
      cs: 2_000, gold: 120_000, visionScore: 200, controlWards: 20,
      wardsPlaced: 100, wardsKilled: 30, opScore: 62, opScoreRank: 35,
      mvp: 3, ace: 1, laneScore: 700, laneScoreCount: 10, laneLead: 6,
      doubleKills: 4, doubleKillGames: 3, tripleKills: 1, tripleKillGames: 1,
      quadraKills: 0, quadraKillGames: 0, pentaKills: 0, pentaKillGames: 0,
    },
    extend: {
      damageTaken: 150_000, damageSelfMitigated: 80_000, heal: 20_000,
      healToTeam: 2_000, shieldToTeam: 4_000, physicalDamageToChampion: 30_000,
      magicDamageToChampion: 160_000,
      // La fuente llama "true" a este total. El verdadero es 200k - 30k - 160k = 10k.
      totalDamageToChampion: 200_000,
      damageToObjective: 40_000, damageToTurret: 25_000, damageToBuildingDuplicate: 25_000,
      turretKills: 5, inhibitorKills: 1, objectiveSteals: 0, ccScore: 300,
      soloKills: 6, soloKillGames: 4, invadeKills: 1, invadeKillGames: 1, invadeGames: 2,
      neutralCs: 20, buffSteals: 0, enemyJungleMonsterKills: 0,
      epicMonsterKillsNearEnemyJungler: 0, epicMonsterStealsWithoutSmite: 0,
      initialCrabKills: 0, jungleCsAt10: 0, laneAdvantagesAt7: 6, laneCsAt10: 800,
      turretPlates: 12, crowdControls: 20, crowdControlKills: 8, alliesSaved: 1,
      wardsGuarded: 2, fasterSupportQuests: 0, evolutionNone: 0, evolutionFirst: 0,
      evolutionSecond: 0,
    },
  };
}

describe('metricas recientes de Scout', () => {
  it('calcula tasas ponderadas, ritmo, roles, actividad y lado sin contar remakes', () => {
    const metrics = summarizeScoutMatches([
      match(),
      match({
        playedAt: new Date('2026-09-12T03:45:00Z'),
        durationSeconds: 1200,
        position: 'SUPPORT',
        teamKey: 'RED',
        kills: 0,
        deaths: 4,
        assists: 6,
        cs: 20,
        damageDealt: 4_000,
        teamKills: 10,
        win: false,
      }),
      match({ durationSeconds: 240, teamKills: 1, cs: 1000, damageDealt: 999_999 }),
    ]);

    expect(metrics).toMatchObject({ games: 2, wins: 1, losses: 1, winRate: 0.5 });
    expect(metrics.killParticipation).toBeCloseTo(16 / 30);
    expect(metrics.csPerMinute).toBeCloseTo(200 / 50);
    expect(metrics.damagePerMinute).toBeCloseTo(22_000 / 50);
    expect(metrics.avgDurationSeconds).toBe(1500);
    expect(metrics.roles).toEqual([
      expect.objectContaining({ key: 'MID', games: 1, share: 0.5, winRate: 1 }),
      expect.objectContaining({ key: 'SUPPORT', games: 1, share: 0.5, winRate: 0 }),
    ]);
    expect(metrics.weekdays.find((day) => day.key === 'Sat')).toMatchObject({ games: 2, wins: 1 });
    expect(metrics.hours.find((hour) => hour.key === '00')).toMatchObject({ games: 2, wins: 1 });
    expect(metrics.sides).toEqual([
      expect.objectContaining({ key: 'BLUE', games: 1, wins: 1 }),
      expect.objectContaining({ key: 'RED', games: 1, wins: 0 }),
    ]);
  });

  it('devuelve ceros estables cuando no hay partidas', () => {
    expect(summarizeScoutMatches([])).toMatchObject({
      games: 0,
      winRate: 0,
      killParticipation: 0,
      csPerMinute: 0,
      damagePerMinute: 0,
      avgDurationSeconds: 0,
    });
  });

  it('calcula reparto de roles y lados solo sobre partidas que tienen esos datos', () => {
    const metrics = summarizeScoutMatches([
      match({ position: 'MID', teamKey: 'BLUE' }),
      match({ position: null, teamKey: 'SCUTTLE' }),
    ]);

    expect(metrics.roles[0]).toMatchObject({ key: 'MID', games: 1, share: 1 });
    expect(metrics.sides[0]).toMatchObject({ key: 'BLUE', games: 1, share: 1 });
    expect(metrics.sides[1]).toMatchObject({ key: 'RED', games: 0, share: 0 });
  });
});

describe('metricas de temporada', () => {
  it('divide las sumas por play y calcula dano verdadero sin duplicar edificios', () => {
    const metrics = normalizeRankedChampion(rankedChampion());

    expect(metrics.killParticipation).toBeCloseTo(0.48);
    expect(metrics.damageParticipation).toBeCloseTo(0.26);
    expect(metrics.opScore).toBeCloseTo(6.2);
    expect(metrics.csPerGame).toBe(200);
    expect(metrics.damagePerGame).toBe(20_000);
    expect(metrics.physicalDamagePerGame).toBe(3_000);
    expect(metrics.magicDamagePerGame).toBe(16_000);
    expect(metrics.trueDamagePerGame).toBe(1_000);
    expect(metrics.turretDamagePerGame).toBe(2_500);
  });

  it('compara las ultimas partidas con el total exacto de la temporada', () => {
    const comparison = compareRecentToSeason(
      [match({ win: true }), match({ win: false })],
      { queue: 'RANKED', seasonId: 33, games: 100, wins: 55, losses: 45, champions: [] },
    );

    expect(comparison.recent).toEqual({ games: 2, wins: 1, losses: 1, winRate: 0.5 });
    expect(comparison.season).toEqual({ games: 100, wins: 55, losses: 45, winRate: 0.55 });
    expect(comparison.winRateDelta).toBeCloseTo(-0.05);
  });
});
