import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  buildOpponentAnalystReport,
  buildRoleQueueReferences,
  buildSelfAnalystReport,
  deriveLaneDifferential,
} from '@/features/scout/analyst';
import { createOpggProvider } from '@/features/matches/opgg/opgg-provider';
import type {
  MatchDetail,
  MatchParticipant,
  PlayerMatchSummary,
  RankedSeason,
  RankedSeasonChampion,
} from '@/features/matches/types';

const completeProfileFixture = (): string => readFileSync(
  new URL('./fixtures/opgg/profile-campos-completos.txt', import.meta.url),
  'utf8',
).replace(
  'Player(null,null,null,null,null,null,null,null,null)","https://esports.op.gg/players/1836"',
  'Player(null,null,null,null,null,null,"https://esports.op.gg/players/1836"',
);

let nextId = 0;

function participant(overrides: Partial<MatchParticipant> = {}): MatchParticipant {
  nextId += 1;
  return {
    puuid: `puuid-falso-${nextId}`,
    gameName: `Jugador ${nextId}`,
    tagLine: 'TEST',
    championId: nextId,
    championName: 'Campeón de prueba',
    teamKey: 'BLUE',
    position: 'MID',
    kills: 5,
    deaths: 5,
    assists: 5,
    championLevel: 15,
    cs: 210,
    damageDealt: 21_000,
    damageTaken: 15_000,
    goldEarned: 12_000,
    result: 'WIN',
    opScore: 5,
    opScoreRank: 5,
    isTarget: false,
    ...overrides,
  };
}

function detail({
  matchId,
  queue = 'SOLORANKED',
  target,
  opponent,
  playedAt = '2026-09-15T21:00:00.000Z',
}: {
  matchId: string;
  queue?: string;
  target: MatchParticipant;
  opponent?: MatchParticipant;
  playedAt?: string;
}): MatchDetail {
  return {
    matchId,
    playedAt,
    queue,
    durationSeconds: 1_800,
    teams: [
      { key: 'BLUE', win: true, kills: 20, goldEarned: 50_000, participants: [target] },
      {
        key: 'RED',
        win: false,
        kills: 15,
        goldEarned: 45_000,
        participants: opponent ? [opponent] : [],
      },
    ],
  };
}

function summary(overrides: Partial<PlayerMatchSummary> = {}): PlayerMatchSummary {
  nextId += 1;
  return {
    matchId: `resumen-${nextId}`,
    playedAt: new Date('2026-09-15T21:00:00.000Z'),
    queue: 'SOLORANKED',
    durationSeconds: 1_800,
    puuid: 'puuid-objetivo-falso',
    championId: 1,
    championName: 'Annie',
    position: 'MID',
    teamKey: 'BLUE',
    kills: 5,
    deaths: 5,
    assists: 5,
    championLevel: 15,
    cs: 210,
    damageDealt: 21_000,
    damageTaken: 15_000,
    teamKills: 20,
    win: true,
    result: 'WIN',
    opScore: 5,
    opScoreRank: 5,
    ...overrides,
  };
}

function seasonChampion(
  overrides: Partial<RankedSeasonChampion> = {},
  extendOverrides: Partial<RankedSeasonChampion['extend']> = {},
): RankedSeasonChampion {
  return {
    championId: 1,
    championName: 'Annie',
    games: 10,
    wins: 5,
    losses: 5,
    durationSeconds: 18_000,
    basic: {
      kills: 50, deaths: 50, assists: 50, killParticipation: 5,
      damageToChampion: 200_000, damageParticipation: 2.5, damageDistribution: 1.5,
      cs: 2_000, gold: 120_000, visionScore: 200, controlWards: 20,
      wardsPlaced: 100, wardsKilled: 30, opScore: 60, opScoreRank: 40,
      mvp: 2, ace: 2, laneScore: 500, laneScoreCount: 10, laneLead: 5,
      doubleKills: 4, doubleKillGames: 3, tripleKills: 1, tripleKillGames: 1,
      quadraKills: 0, quadraKillGames: 0, pentaKills: 0, pentaKillGames: 0,
    },
    extend: {
      damageTaken: 150_000, damageSelfMitigated: 80_000, heal: 20_000,
      healToTeam: 2_000, shieldToTeam: 4_000, physicalDamageToChampion: 30_000,
      magicDamageToChampion: 160_000, totalDamageToChampion: 200_000,
      damageToObjective: 40_000, damageToTurret: 25_000, damageToBuildingDuplicate: 25_000,
      turretKills: 5, inhibitorKills: 1, objectiveSteals: 0, ccScore: 300,
      soloKills: 2, soloKillGames: 2, invadeKills: 0, invadeKillGames: 0, invadeGames: 0,
      neutralCs: 0, buffSteals: 0, enemyJungleMonsterKills: 0,
      epicMonsterKillsNearEnemyJungler: 0, epicMonsterStealsWithoutSmite: 0,
      initialCrabKills: 0, jungleCsAt10: 0, laneAdvantagesAt7: 3, laneCsAt10: 650,
      turretPlates: 8, crowdControls: 20, crowdControlKills: 8, alliesSaved: 1,
      wardsGuarded: 2, fasterSupportQuests: 0, evolutionNone: 0, evolutionFirst: 0,
      evolutionSecond: 0,
      ...extendOverrides,
    },
    ...overrides,
  };
}

function rankedSeason(champions = [seasonChampion()]): RankedSeason {
  const games = champions.reduce((sum, champion) => sum + champion.games, 0);
  const wins = champions.reduce((sum, champion) => sum + champion.wins, 0);
  return {
    queue: 'RANKED',
    seasonId: 31,
    games,
    wins,
    losses: games - wins,
    champions,
  };
}

describe('referencias por rol y cola', () => {
  it('separa las colas, usa medianas y excluye participantes sin posición', () => {
    const details = [
      detail({ matchId: 'solo-1', target: participant({ cs: 180 }) }),
      detail({ matchId: 'solo-2', target: participant({ cs: 300 }) }),
      detail({ matchId: 'flex-1', queue: 'FLEXRANKED', target: participant({ cs: 120 }) }),
      detail({ matchId: 'flex-2', queue: 'FLEXRANKED', target: participant({ cs: 240 }) }),
      detail({
        matchId: 'arena',
        queue: 'ARENA',
        target: participant({ position: null, cs: 0, teamKey: 'SCUTTLE' }),
      }),
    ];

    const references = buildRoleQueueReferences(details, 2);

    expect(references).toHaveLength(2);
    expect(references.find((reference) => reference.queue === 'SOLORANKED')).toMatchObject({
      position: 'MID',
      sampleSize: 2,
      sufficient: true,
      medians: { csPerMinute: 8 },
    });
    expect(references.find((reference) => reference.queue === 'FLEXRANKED')).toMatchObject({
      sampleSize: 2,
      medians: { csPerMinute: 6 },
    });
    expect(references.some((reference) => reference.queue === 'ARENA')).toBe(false);
  });

  it('informa el tamaño del grupo, pero no inventa una referencia si no llega al mínimo', () => {
    const references = buildRoleQueueReferences([
      detail({ matchId: 'muestra-chica', target: participant() }),
    ], 2);

    expect(references[0]).toMatchObject({ sampleSize: 1, minimumSample: 2, sufficient: false });
    expect(references[0]?.medians).toBeNull();
  });

  it('funciona sobre el detalle real anonimizado de la fixture de OP.GG', async () => {
    const fixture = readFileSync(new URL('./fixtures/opgg/detail.txt', import.meta.url), 'utf8');
    const provider = createOpggProvider({ client: { callTool: vi.fn(async () => fixture) } });
    const parsed = await provider.getMatchDetail(
      'partida-fixture',
      new Date('2026-09-14T21:51:50.000Z'),
      { gameName: 'Invocador', tagLine: 'LAS1' },
    );

    const references = buildRoleQueueReferences([parsed], 1);

    expect(references.map((reference) => reference.position).sort()).toEqual([
      'ADC', 'JUNGLE', 'MID', 'SUPPORT', 'TOP',
    ]);
    expect(references.every((reference) => (
      reference.sufficient && (reference.medians?.goldPerMinute ?? 0) > 0
    ))).toBe(true);
  });
});

describe('diferencial contra el rival directo', () => {
  it('resume las últimas seis comparaciones del mismo rol con mediana y resultado cabeza a cabeza', () => {
    const differences = [30, 20, 10, -5, 15, -2];
    const details = differences.map((difference, index) => detail({
      matchId: `lane-${index}`,
      playedAt: `2026-09-${String(15 - index).padStart(2, '0')}T21:00:00.000Z`,
      target: participant({ puuid: 'puuid-objetivo-falso', cs: 200 + difference }),
      opponent: participant({ position: 'MID', teamKey: 'RED', cs: 200 }),
    }));

    expect(deriveLaneDifferential(details, 'puuid-objetivo-falso')).toEqual({
      games: 6,
      ahead: 4,
      behind: 2,
      tied: 0,
      medianCsDifference: 12.5,
    });
  });
});

describe('generador de fortalezas y debilidades', () => {
  it('limita la lectura rival a tres señales por lado y todas llevan número y comparación', () => {
    const referenceDetails = Array.from({ length: 20 }, (_, index) => detail({
      matchId: `referencia-${index}`,
      target: participant(),
    }));
    const playerDetails = Array.from({ length: 6 }, (_, index) => detail({
      matchId: `objetivo-${index}`,
      playedAt: `2026-09-${String(15 - index).padStart(2, '0')}T21:00:00.000Z`,
      target: participant({
        puuid: 'puuid-objetivo-falso',
        cs: 330,
        damageDealt: 36_000,
        goldEarned: 18_000,
        kills: 12,
        deaths: 2,
        assists: 10,
      }),
      opponent: participant({ position: 'MID', teamKey: 'RED', cs: 240 }),
    }));
    const matches = playerDetails.map((match, index) => summary({
      matchId: match.matchId,
      playedAt: new Date(match.playedAt),
      cs: 330,
      damageDealt: 36_000,
      kills: 12,
      deaths: 2,
      assists: 10,
    }));

    const report = buildOpponentAnalystReport({
      details: [...referenceDetails, ...playerDetails],
      matches,
    });

    expect(report.strengths).toHaveLength(3);
    expect(report.weaknesses).toHaveLength(0);
    expect(report.strengths.some((signal) => signal.id === 'lane')).toBe(true);
    for (const signal of report.strengths) {
      expect(signal.text).toMatch(/\d/);
      expect(signal.text).toMatch(/contra/);
    }
  });

  it('explica cuando la muestra por rol y cola no alcanza', () => {
    const report = buildOpponentAnalystReport({
      details: [detail({ matchId: 'una', target: participant() })],
      matches: [summary({ matchId: 'una' })],
    });

    expect(report.strengths).toEqual([]);
    expect(report.weaknesses).toEqual([]);
    expect(report.note).toContain('1 de 20 participantes necesarios');
  });

  it('en perfil propio marca campeón y horario contra el promedio personal', () => {
    const matches = Array.from({ length: 20 }, (_, index) => {
      const isBest = index < 4;
      const isWorst = index >= 4 && index < 8;
      const isNight = index >= 4 && index < 8;
      return summary({
        matchId: `propia-${index}`,
        playedAt: new Date(`2026-09-${String(15 - (index % 10)).padStart(2, '0')}T${isNight ? '02' : '15'}:00:00.000Z`),
        championId: isBest ? 1 : isWorst ? 2 : 3 + index,
        championName: isBest ? 'Annie' : isWorst ? 'Yasuo' : `Campeón ${index}`,
        win: isBest || (!isWorst && index % 2 === 0),
      });
    });

    const report = buildSelfAnalystReport({ matches, timeZone: 'UTC' });

    expect(report.strengths).toHaveLength(1);
    expect(report.strengths[0]).toMatchObject({ id: 'self-best-champion' });
    expect(report.weaknesses.map((signal) => signal.id)).toEqual(expect.arrayContaining([
      'self-worst-champion',
      'self-worst-time',
    ]));
    expect(report.strengths[0]?.text).toMatch(/100%.*contra tu \d+% general/);
    expect(report.weaknesses.every((signal) => /\d/.test(signal.text) && signal.text.includes('contra'))).toBe(true);
    expect(report.strengths.length).toBeLessThanOrEqual(3);
    expect(report.weaknesses.length).toBeLessThanOrEqual(5);
  });

  it('en perfil propio compara muertes, farmeo y participación contra la mediana del rol', () => {
    const referenceDetails = Array.from({ length: 20 }, (_, index) => detail({
      matchId: `referencia-propia-${index}`,
      target: participant(),
    }));
    const playerDetails = Array.from({ length: 6 }, (_, index) => detail({
      matchId: `jugador-propio-${index}`,
      target: participant({
        puuid: 'puuid-objetivo-falso',
        cs: 120,
        damageDealt: 9_000,
        goldEarned: 6_000,
        kills: 1,
        deaths: 10,
        assists: 2,
      }),
    }));
    const matches = playerDetails.map((match) => summary({
      matchId: match.matchId,
      playedAt: new Date(match.playedAt),
      cs: 120,
      damageDealt: 9_000,
      kills: 1,
      deaths: 10,
      assists: 2,
    }));

    const report = buildSelfAnalystReport({
      details: [...referenceDetails, ...playerDetails],
      matches,
      season: rankedSeason(),
    });

    expect(report.weaknesses.map((signal) => signal.id)).toEqual([
      'deaths',
      'cs',
      'self-early-lane',
      'kp',
      'damage',
    ]);
    expect(report.weaknesses[0]?.text).toBe(
      'Morís demasiado: 10,0 muertes/partida, contra 5,0 muertes/partida de mediana para mid en Solo/Duo.',
    );
    expect(report.context).toEqual({
      queue: 'SOLORANKED',
      position: 'MID',
      playerGames: 6,
      referenceSample: 26,
    });
    expect(report.note).toContain('no se puede medir si morís rápido');
  });

  it('contesta por las muertes aunque estén cerca de la mediana y no sean una señal', () => {
    const details = Array.from({ length: 20 }, (_, index) => detail({
      matchId: `referencia-muertes-${index}`,
      target: participant(),
    }));
    const matches = Array.from({ length: 5 }, (_, index) => summary({
      matchId: `muertes-parejas-${index}`,
      deaths: 5,
    }));

    const report = buildSelfAnalystReport({ details, matches });

    expect([...report.strengths, ...report.weaknesses].some((signal) => signal.id === 'deaths'))
      .toBe(false);
    expect(report.note).toContain(
      'Tus muertes están cerca de la mediana: 5,0 por partida, contra 5,0 para mid en Solo/Duo.',
    );
  });

  it('divide los acumulados de temporada para describir la lane temprana', () => {
    const matches = Array.from({ length: 10 }, (_, index) => summary({
      matchId: `lane-temprana-${index}`,
      playedAt: new Date(`2026-09-${String(15 - index).padStart(2, '0')}T21:00:00.000Z`),
    }));

    const report = buildSelfAnalystReport({ matches, season: rankedSeason() });

    expect(report.weaknesses).toEqual(expect.arrayContaining([{
      id: 'self-early-lane',
      text: 'Lane temprana floja: ventaja al 7 en 30% (3 de 10), contra 50%; promediás 65,0 CS al 10, 0,2 solo kills y 0,8 placas, con solo kill en 20%.',
    }]));
  });

  it('usa los acumulados tempranos parseados de la fixture real anonimizada', async () => {
    const provider = createOpggProvider({
      client: { callTool: vi.fn(async () => completeProfileFixture()) },
    });
    const profile = await provider.getProfile({ gameName: 'Invocador', tagLine: 'LAS1' });
    const matches = Array.from({ length: 10 }, (_, index) => summary({
      matchId: `fixture-lane-${index}`,
    }));

    const report = buildSelfAnalystReport({ matches, season: profile.rankedSeason });

    expect(report.weaknesses.find((signal) => signal.id === 'self-early-lane')?.text).toBe(
      'Lane temprana floja: ventaja al 7 en 14% (53 de 374), contra 50%; promediás 87,6 CS al 10, 1,6 solo kills y 9,4 placas, con solo kill en 68%.',
    );
  });

  it('omite comparaciones por rol y lane cuando las muestras no alcanzan', () => {
    const matches = Array.from({ length: 2 }, (_, index) => summary({
      matchId: `muestra-propia-${index}`,
    }));
    const report = buildSelfAnalystReport({
      details: [detail({ matchId: 'detalle-propio', target: participant() })],
      matches,
      season: rankedSeason([seasonChampion({ games: 9, wins: 5, losses: 4 })]),
    });

    expect(report.strengths).toEqual([]);
    expect(report.weaknesses).toEqual([]);
    expect(report.note).toContain('1 de 20 participantes necesarios');
  });
});
