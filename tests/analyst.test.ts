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
} from '@/features/matches/types';

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
    expect(report.weaknesses.length).toBeLessThanOrEqual(3);
  });
});
