import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import {
  champions,
  draftRecordPicks,
  draftRecords,
  draftSyncRuns,
  matchDetails,
  playerMatches,
  users,
} from '@/db/schema';
import { analyzeDraft, buildDraftMatrix, type Draft } from '@/features/draft/analysis';
import {
  attachDraftRecordMatch,
  buildDraftCalibration,
  createDraftRecord,
  deleteDraftRecord,
  DraftRecordError,
  listDraftRecords,
  matchDraftToDetail,
  recordWasCorrect,
  type DraftRecordView,
} from '@/features/draft/records';
import type { MatchDetail, MatchParticipant } from '@/features/matches/types';

const PLAYED_AT = new Date('2026-09-17T20:00:00.000Z');
const SAVED_BEFORE = new Date('2026-09-17T19:30:00.000Z');
const SAVED_AFTER = new Date('2026-09-17T20:30:00.000Z');
const ROLES = ['top', 'jungle', 'middle', 'bottom', 'support'] as const;

const draft: Draft = {
  allies: ROLES.map((role, index) => ({ championKey: index + 1, role })),
  enemies: ROLES.map((role, index) => ({ championKey: index + 6, role })),
};

function participant(championId: number, teamKey: string, result: string): MatchParticipant {
  return {
    puuid: `puuid-${championId}`,
    gameName: `Jugador ${championId}`,
    tagLine: 'TEST',
    championId,
    championName: `Campeón ${championId}`,
    teamKey,
    position: ROLES[(championId - 1) % 5] ?? 'top',
    kills: 1,
    deaths: 2,
    assists: 3,
    championLevel: 18,
    cs: 100,
    damageDealt: 10_000,
    damageTaken: 8_000,
    goldEarned: 12_000,
    result,
    opScore: null,
    opScoreRank: null,
    isTarget: championId === 1,
  };
}

function detail(options: {
  allyTeamFirst?: boolean;
  alliesWin?: boolean;
  remake?: boolean;
  allyKeys?: number[];
} = {}): MatchDetail {
  const allyTeamFirst = options.allyTeamFirst ?? true;
  const alliesWin = options.alliesWin ?? true;
  const allyKeys = options.allyKeys ?? [1, 2, 3, 4, 5];
  const enemyKeys = [6, 7, 8, 9, 10];
  const result = (win: boolean) => options.remake ? 'REMAKE' : win ? 'WIN' : 'LOSE';
  const allyTeam = {
    key: 'BLUE',
    win: alliesWin,
    kills: 20,
    goldEarned: 60_000,
    participants: allyKeys.map((key) => participant(key, 'BLUE', result(alliesWin))),
  };
  const enemyTeam = {
    key: 'RED',
    win: !alliesWin,
    kills: 10,
    goldEarned: 50_000,
    participants: enemyKeys.map((key) => participant(key, 'RED', result(!alliesWin))),
  };
  return {
    matchId: 'MATCH-1',
    playedAt: PLAYED_AT.toISOString(),
    queue: 'FLEXRANKED',
    durationSeconds: 1_800,
    teams: allyTeamFirst ? [allyTeam, enemyTeam] : [enemyTeam, allyTeam],
  };
}

function pickViews() {
  return [
    ...draft.allies.map((pick) => ({ ...pick, side: 'allies' as const, championName: `Campeón ${pick.championKey}` })),
    ...draft.enemies.map((pick) => ({ ...pick, side: 'enemies' as const, championName: `Campeón ${pick.championKey}` })),
  ];
}

let sqlite: Database.Database;
let db: Db;
let memberId: number;
let run: { id: number; finishedAt: Date; patchWindow: string };

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  for (let key = 1; key <= 11; key += 1) {
    db.insert(champions).values({
      id: `Champion${key}`,
      key,
      name: `Campeón ${key}`,
      title: 'Título',
      imageFile: `Champion${key}.png`,
      version: '1.0.0',
    }).run();
  }
  memberId = db.insert(users).values({
    externalIdentity: 'test:member',
    email: 'member@example.com',
    displayName: 'Miembro',
    createdAt: SAVED_BEFORE,
  }).returning({ id: users.id }).get().id;
  run = db.insert(draftSyncRuns).values({
    startedAt: new Date('2026-09-17T10:00:00Z'),
    finishedAt: new Date('2026-09-17T11:00:00Z'),
    patchWindow: '30',
    totalRequests: 1,
  }).returning({
    id: draftSyncRuns.id,
    finishedAt: draftSyncRuns.finishedAt,
    patchWindow: draftSyncRuns.patchWindow,
  }).get() as typeof run;
});

afterEach(() => sqlite.close());

function save(at: Date): number {
  const matrix = buildDraftMatrix({ championKeys: [], championStats: [], matchups: [], synergies: [] });
  return createDraftRecord(db, memberId, draft, 'medium', run, analyzeDraft(matrix, draft), at);
}

function cacheMatch(snapshot: MatchDetail): void {
  db.insert(playerMatches).values({
    userId: memberId,
    provider: 'cache',
    matchId: snapshot.matchId,
    puuid: 'puuid-1',
    playedAt: PLAYED_AT,
    queue: snapshot.queue,
    durationSeconds: snapshot.durationSeconds,
    championId: 1,
    championName: 'Campeón 1',
    position: 'top',
    teamKey: 'BLUE',
    kills: 1,
    deaths: 2,
    assists: 3,
    championLevel: 18,
    cs: 100,
    damageDealt: 10_000,
    damageTaken: 8_000,
    teamKills: 20,
    win: true,
    result: 'WIN',
    opScore: null,
    opScoreRank: null,
    fetchedAt: PLAYED_AT,
  }).run();
  db.insert(matchDetails).values({
    provider: 'cache',
    matchId: snapshot.matchId,
    playedAt: PLAYED_AT,
    data: snapshot,
    fetchedAt: PLAYED_AT,
  }).run();
}

describe('registro de drafts', () => {
  it('no guarda un draft incompleto', () => {
    const matrix = buildDraftMatrix({ championKeys: [], championStats: [], matchups: [], synergies: [] });
    const incomplete = { allies: draft.allies.slice(0, 4), enemies: draft.enemies };

    expect(() => createDraftRecord(
      db,
      memberId,
      incomplete,
      'medium',
      run,
      analyzeDraft(matrix, incomplete),
      SAVED_BEFORE,
    )).toThrow('Completá los cinco campeones de cada lado');
    expect(db.select().from(draftRecords).all()).toHaveLength(0);
  });

  it('rechaza una partida con campeones distintos y explica la diferencia', () => {
    const snapshot = detail({ allyKeys: [1, 2, 3, 4, 11] });

    expect(() => matchDraftToDetail(pickViews(), snapshot)).toThrow(DraftRecordError);
    expect(() => matchDraftToDetail(pickViews(), snapshot)).toThrow(/faltan Campeón 5/);
    expect(() => matchDraftToDetail(pickViews(), snapshot)).toThrow(/aparecen Campeón 11/);
  });

  it('no adjunta en la base una partida cacheada con campeones distintos', () => {
    const recordId = save(SAVED_BEFORE);
    cacheMatch(detail({ allyKeys: [1, 2, 3, 4, 11] }));

    expect(() => attachDraftRecordMatch(db, recordId, 'cache', 'MATCH-1', SAVED_AFTER))
      .toThrow(/faltan Campeón 5/);
    expect(db.select().from(draftRecords).where(eq(draftRecords.id, recordId)).get()?.matchId)
      .toBeNull();
  });

  it('detecta el lado aliado y el resultado con aliados en cualquiera de los dos teams', () => {
    expect(matchDraftToDetail(pickViews(), detail({ allyTeamFirst: true, alliesWin: true }))).toMatchObject({
      allyTeamKey: 'BLUE',
      result: 'win',
    });
    expect(matchDraftToDetail(pickViews(), detail({ allyTeamFirst: false, alliesWin: false }))).toMatchObject({
      allyTeamKey: 'BLUE',
      result: 'lose',
    });
  });

  it('marca un remake como otro resultado y no lo cuenta como acierto ni error', () => {
    const matched = matchDraftToDetail(pickViews(), detail({ remake: true }));
    const record = {
      predictedAllyWinrate: 0.65,
      match: { result: matched.result, savedAfterMatch: false },
    } as DraftRecordView;

    expect(matched.result).toBe('other');
    expect(recordWasCorrect(record)).toBeNull();
    expect(buildDraftCalibration([record])).toMatchObject({ eligibleN: 0, excludedN: 1 });
  });

  it('marca y excluye un draft guardado después del playedAt', () => {
    const recordId = save(SAVED_AFTER);
    cacheMatch(detail());
    db.update(draftRecords).set({ predictedAllyWinrate: 0.65 }).where(eq(draftRecords.id, recordId)).run();

    attachDraftRecordMatch(db, recordId, 'cache', 'MATCH-1', new Date('2026-09-17T21:00:00Z'));
    const [record] = listDraftRecords(db, memberId);

    expect(record?.match?.savedAfterMatch).toBe(true);
    expect(recordWasCorrect(record!)).toBeNull();
    expect(buildDraftCalibration([record!])).toMatchObject({ eligibleN: 0, excludedN: 1 });
  });

  it('agrupa la calibración por confianza y cada porcentaje conserva su n', () => {
    const normalMatch = (result: 'win' | 'lose') => ({ result, savedAfterMatch: false });
    const records = [
      { predictedAllyWinrate: 0.55, match: normalMatch('win') },
      { predictedAllyWinrate: 0.58, match: normalMatch('lose') },
      { predictedAllyWinrate: 0.68, match: normalMatch('win') },
      { predictedAllyWinrate: 0.35, match: normalMatch('lose') },
      { predictedAllyWinrate: 0.72, match: normalMatch('lose') },
    ] as DraftRecordView[];

    const calibration = buildDraftCalibration(records);
    const fifty = calibration.bands[0];
    const sixty = calibration.bands[1];
    const seventy = calibration.bands[2];

    expect(fifty?.rate).toEqual({ percentage: 0.5, wins: 1, n: 2 });
    expect(sixty?.rate).toEqual({ percentage: 1, wins: 2, n: 2 });
    expect(seventy?.rate).toEqual({ percentage: 0, wins: 0, n: 1 });
    for (const band of calibration.bands) {
      if (band.rate) expect(band.rate).toHaveProperty('n');
    }
    expect(calibration.enoughEvidence).toBe(false);
  });

  it('sólo deja borrar al usuario que guardó el registro', () => {
    const recordId = save(SAVED_BEFORE);
    const otherId = db.insert(users).values({
      externalIdentity: 'test:other',
      email: 'other@example.com',
      displayName: 'Otro',
      createdAt: SAVED_BEFORE,
    }).returning({ id: users.id }).get().id;

    expect(() => deleteDraftRecord(db, otherId, recordId)).toThrow('Solo quien guardó');
    expect(db.select().from(draftRecords).where(eq(draftRecords.id, recordId)).get()).toBeDefined();

    deleteDraftRecord(db, memberId, recordId);
    expect(db.select().from(draftRecords).where(eq(draftRecords.id, recordId)).get()).toBeUndefined();
    expect(db.select().from(draftRecordPicks).all()).toHaveLength(0);
  });
});
