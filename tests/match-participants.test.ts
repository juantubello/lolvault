import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MATCH_DETAILS_PER_SYNC } from '@/config';
import { applyPragmas, createDb, type Db } from '@/db/client';
import { matchDetails, matchParticipants, playerMatches, users } from '@/db/schema';
import {
  listMatchesWithPlayer,
  searchKnownPlayers,
} from '@/features/blacklist/known-players';
import {
  backfillMatchParticipants,
  indexMatchParticipants,
} from '@/features/matches/match-participants';
import {
  hydrateMissingMatchDetails,
  loadMatchDetail,
  loadPlayerStats,
} from '@/features/matches/player-stats';
import type {
  MatchDetail,
  MatchParticipant,
  MatchProvider,
  PlayerMatchSummary,
  RiotId,
} from '@/features/matches/types';

const NOW = new Date('2026-09-15T12:00:00Z');

function participant(
  gameName: string,
  tagLine: string,
  puuid: string,
  overrides: Partial<MatchParticipant> = {},
): MatchParticipant {
  return {
    puuid,
    gameName,
    tagLine,
    championId: 103,
    championName: 'Ahri',
    teamKey: 'BLUE',
    position: 'MID',
    kills: 8,
    deaths: 3,
    assists: 9,
    championLevel: 18,
    cs: 240,
    damageDealt: 25_000,
    damageTaken: 18_000,
    goldEarned: 14_000,
    result: 'WIN',
    opScore: 7.2,
    opScoreRank: 2,
    isTarget: false,
    ...overrides,
  };
}

function detail(matchId: string, playedAt: Date, participants: MatchParticipant[]): MatchDetail {
  return {
    matchId,
    playedAt: playedAt.toISOString(),
    queue: 'FLEXRANKED',
    durationSeconds: 1800,
    teams: [
      {
        key: 'BLUE',
        win: true,
        kills: 25,
        goldEarned: 55_000,
        participants,
      },
    ],
  };
}

function summary(matchId: string, playedAt: Date, puuid: string): PlayerMatchSummary {
  return {
    matchId,
    playedAt,
    queue: 'FLEXRANKED',
    durationSeconds: 1800,
    puuid,
    championId: 1,
    championName: 'Annie',
    position: 'MID',
    teamKey: 'BLUE',
    kills: 4,
    deaths: 5,
    assists: 6,
    championLevel: 16,
    cs: 190,
    damageDealt: 18_000,
    damageTaken: 15_000,
    teamKills: 25,
    win: true,
    result: 'WIN',
    opScore: null,
    opScoreRank: null,
  };
}

let sqlite: Database.Database;
let db: Db;

function addUser(name: string, riotId: RiotId): number {
  return db
    .insert(users)
    .values({
      externalIdentity: `test:${name}`,
      email: `${name}@example.com`,
      displayName: name,
      riotGameName: riotId.gameName,
      riotTagLine: riotId.tagLine,
      createdAt: NOW,
    })
    .returning({ id: users.id })
    .get().id;
}

function cacheMemberMatch(userId: number, provider: string, row: PlayerMatchSummary): void {
  db.insert(playerMatches).values({ ...row, userId, provider, fetchedAt: NOW }).run();
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterEach(() => sqlite.close());

describe('índice y búsqueda de participantes', () => {
  it('busca sin tildes, excluye miembros y agrupa partidas y compañeros', () => {
    const memberA = addUser('Miembro A', { gameName: 'PropioUno', tagLine: 'LAS' });
    const memberB = addUser('Miembro B', { gameName: 'PropioDos', tagLine: 'LAS' });
    const played1 = new Date('2026-09-14T20:00:00Z');
    const played2 = new Date('2026-09-15T10:00:00Z');
    const d1 = detail('m1', played1, [
      participant('Álvaro', 'LAS', 'external-1'),
      participant('PropioUno', 'LAS', 'member-1'),
    ]);
    const d2 = detail('m2', played2, [
      participant('álvaro', 'las', 'external-1'),
      participant('PropioDos', 'LAS', 'member-2'),
    ]);
    for (const row of [d1, d2]) {
      db.insert(matchDetails)
        .values({ provider: 'fake', matchId: row.matchId, playedAt: new Date(row.playedAt), data: row, fetchedAt: NOW })
        .run();
      indexMatchParticipants(db, 'fake', row);
    }
    cacheMemberMatch(memberA, 'fake', summary('m1', played1, 'member-1'));
    cacheMemberMatch(memberB, 'fake', summary('m2', played2, 'member-2'));

    const suggestions = searchKnownPlayers(db, 'alv', NOW);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      riotIdText: 'álvaro#las',
      sharedMatches: 2,
      lastPlayedAt: played2,
      members: [
        { id: memberA, displayName: 'Miembro A' },
        { id: memberB, displayName: 'Miembro B' },
      ],
    });
    expect(searchKnownPlayers(db, 'propio', NOW)).toEqual([]);
    expect(searchKnownPlayers(db, 'a', NOW)).toEqual([]);

    expect(listMatchesWithPlayer(db, { gameName: 'ALVARO', tagLine: 'LAS' })).toEqual([]);
    const matches = listMatchesWithPlayer(db, { gameName: 'ÁLVARO', tagLine: 'las' });
    expect(matches.map((match) => match.matchId)).toEqual(['m2', 'm1']);
    expect(matches[0]).toMatchObject({ championName: 'Ahri', kills: 8, deaths: 3, assists: 9 });
  });

  it('hace backfill idempotente de detalles cacheados', () => {
    const cached = detail('cached', NOW, [
      participant('Jugador Uno', 'LAS', 'p1'),
      participant('Jugador Dos', 'LAS', 'p2'),
    ]);
    db.insert(matchDetails)
      .values({ provider: 'fake', matchId: 'cached', playedAt: NOW, data: cached, fetchedAt: NOW })
      .run();

    expect(backfillMatchParticipants(db)).toBe(1);
    expect(backfillMatchParticipants(db)).toBe(1);
    expect(db.select({ value: count() }).from(matchParticipants).get()?.value).toBe(2);
  });

  it('indexa al guardar un detalle nuevo', async () => {
    const loaded = detail('new', NOW, [participant('Jugador Nuevo', 'LAS', 'new-puuid')]);
    const provider: MatchProvider = {
      name: 'fake',
      listMatches: vi.fn(async () => []),
      getProfile: vi.fn(async () => {
        throw new Error('no usado');
      }),
      getMatchDetail: vi.fn(async () => loaded),
    };

    await loadMatchDetail(
      db,
      provider,
      { matchId: 'new', playedAt: NOW },
      { gameName: 'Foco', tagLine: 'LAS' },
      NOW,
    );
    expect(
      db.select().from(matchParticipants).where(eq(matchParticipants.matchId, 'new')).get(),
    ).toMatchObject({ gameName: 'Jugador Nuevo', searchName: 'jugador nuevo' });
  });
});

describe('hidratación progresiva', () => {
  it('pide detalles de a uno y respeta MATCH_DETAILS_PER_SYNC', async () => {
    const userId = addUser('Miembro', { gameName: 'MiembroRiot', tagLine: 'LAS' });
    for (let index = 0; index < MATCH_DETAILS_PER_SYNC + 2; index += 1) {
      const playedAt = new Date(NOW.getTime() - index * 60_000);
      cacheMemberMatch(userId, 'fake', summary(`m${index}`, playedAt, 'member-puuid'));
    }
    let activeCalls = 0;
    let maxActiveCalls = 0;
    const getMatchDetail = vi.fn(async (matchId: string, playedAt: Date) => {
      activeCalls += 1;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      await Promise.resolve();
      activeCalls -= 1;
      return detail(matchId, playedAt, [participant(`Externo ${matchId}`, 'LAS', `p-${matchId}`)]);
    });
    const provider: MatchProvider = {
      name: 'fake',
      listMatches: vi.fn(async () => []),
      getProfile: vi.fn(async () => {
        throw new Error('no usado');
      }),
      getMatchDetail,
    };

    const hydrated = await hydrateMissingMatchDetails(
      db,
      provider,
      { id: userId, riotGameName: 'MiembroRiot', riotTagLine: 'LAS' },
      NOW,
    );
    expect(hydrated).toBe(MATCH_DETAILS_PER_SYNC);
    expect(getMatchDetail).toHaveBeenCalledTimes(MATCH_DETAILS_PER_SYNC);
    expect(maxActiveCalls).toBe(1);
  });

  it('agenda la hidratación después de un sync exitoso usando el scheduler inyectado', async () => {
    const userId = addUser('Miembro', { gameName: 'MiembroRiot', tagLine: 'LAS' });
    const playedAt = new Date(NOW.getTime() - 60_000);
    const provider: MatchProvider = {
      name: 'fake',
      listMatches: vi.fn(async () => [summary('scheduled', playedAt, 'member-puuid')]),
      getProfile: vi.fn(async () => ({
        puuid: 'member-puuid',
        gameName: 'MiembroRiot',
        tagLine: 'LAS',
        level: null,
        profileImageUrl: null,
        ranks: [],
        seasonChampions: [],
      })),
      getMatchDetail: vi.fn(async (matchId, date) =>
        detail(matchId, date, [participant('Jugador Externo', 'LAS', 'external-puuid')]),
      ),
    };
    const tasks: Array<() => void | Promise<void>> = [];

    await loadPlayerStats(
      db,
      provider,
      { id: userId, riotGameName: 'MiembroRiot', riotTagLine: 'LAS' },
      NOW,
      (task) => tasks.push(task),
    );
    expect(tasks).toHaveLength(1);
    expect(provider.getMatchDetail).not.toHaveBeenCalled();
    await tasks[0]!();
    expect(provider.getMatchDetail).toHaveBeenCalledOnce();
    expect(
      db.select().from(matchParticipants).where(eq(matchParticipants.matchId, 'scheduled')).get(),
    ).toBeDefined();
  });
});
