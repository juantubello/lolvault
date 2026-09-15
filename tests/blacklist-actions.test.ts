import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/client')>()),
  getDb: mocks.getDb,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { createBlacklistProposalAction } from '@/features/blacklist/blacklist.actions';
import { applyPragmas, createDb, type Db } from '@/db/client';
import {
  blacklistProposals,
  matchDetails,
  playerMatches,
  users,
} from '@/db/schema';
import { indexMatchParticipants } from '@/features/matches/match-participants';
import type { MatchDetail, MatchParticipant } from '@/features/matches/types';

const NOW = new Date('2026-09-15T12:00:00Z');

function targetParticipant(): MatchParticipant {
  return {
    puuid: 'external-puuid',
    gameName: 'RivalAnonimo',
    tagLine: 'LAS',
    championId: 103,
    championName: 'Ahri',
    teamKey: 'BLUE',
    position: 'MID',
    kills: 2,
    deaths: 11,
    assists: 3,
    championLevel: 15,
    cs: 140,
    damageDealt: 10_000,
    damageTaken: 28_000,
    goldEarned: 9_000,
    result: 'LOSE',
    opScore: 2,
    opScoreRank: 10,
    isTarget: false,
  };
}

function snapshot(): MatchDetail {
  return {
    matchId: 'match-cached',
    playedAt: NOW.toISOString(),
    queue: 'FLEXRANKED',
    durationSeconds: 1800,
    teams: [
      {
        key: 'BLUE',
        win: false,
        kills: 10,
        goldEarned: 40_000,
        participants: [targetParticipant()],
      },
    ],
  };
}

function form(riotId: string): FormData {
  const data = new FormData();
  data.set('userId', '999');
  data.set('playerName', 'Rival recordado');
  data.set('riotId', riotId);
  data.set('reason', 'Conducta antideportiva en la partida.');
  data.set('matchId', 'match-cached');
  return data;
}

let sqlite: Database.Database;
let db: Db;
let memberId: number;

beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  memberId = db
    .insert(users)
    .values({
      externalIdentity: 'test:member',
      email: 'member@example.com',
      displayName: 'Miembro',
      createdAt: NOW,
    })
    .returning({ id: users.id })
    .get().id;
  db.insert(playerMatches)
    .values({
      userId: memberId,
      provider: 'fake',
      matchId: 'match-cached',
      puuid: 'member-puuid',
      playedAt: NOW,
      queue: 'FLEXRANKED',
      durationSeconds: 1800,
      championId: 1,
      championName: 'Annie',
      position: 'MID',
      teamKey: 'RED',
      kills: 8,
      deaths: 4,
      assists: 10,
      championLevel: 18,
      cs: 230,
      damageDealt: 24_000,
      damageTaken: 17_000,
      teamKills: 30,
      win: true,
      result: 'WIN',
      opScore: null,
      opScoreRank: null,
      fetchedAt: NOW,
    })
    .run();
  const detail = snapshot();
  db.insert(matchDetails)
    .values({ provider: 'fake', matchId: detail.matchId, playedAt: NOW, data: detail, fetchedAt: NOW })
    .run();
  indexMatchParticipants(db, 'fake', detail);
  mocks.getDb.mockReturnValue(db);
  mocks.getCurrentUser.mockResolvedValue({ id: memberId, displayName: 'Miembro' });
});

afterEach(() => sqlite.close());

describe('createBlacklistProposalAction', () => {
  it('valida que el Riot ID elegido aparezca en la partida y conserva el form al fallar', async () => {
    const result = await createBlacklistProposalAction({}, form('OtroJugador#LAS'));
    expect(result.fieldErrors?.matchId).toMatch(/no aparece ese Riot ID/);
    expect(result.values).toEqual({
      playerName: 'Rival recordado',
      riotId: 'OtroJugador#LAS',
      reason: 'Conducta antideportiva en la partida.',
      matchId: 'match-cached',
    });
    expect(db.select().from(blacklistProposals).all()).toHaveLength(0);
  });

  it('usa el usuario autenticado y guarda exactamente el snapshot cacheado', async () => {
    const result = await createBlacklistProposalAction({}, form('rivalanonimo#las'));
    expect(result.createdId).toBeTypeOf('number');
    const proposal = db
      .select()
      .from(blacklistProposals)
      .where(eq(blacklistProposals.id, result.createdId!))
      .get();
    expect(proposal).toMatchObject({
      proposerUserId: memberId,
      matchProvider: 'fake',
      matchId: 'match-cached',
      matchSnapshot: snapshot(),
    });
    expect(proposal?.proposerUserId).not.toBe(999);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
