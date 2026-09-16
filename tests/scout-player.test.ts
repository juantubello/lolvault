import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { users } from '@/db/schema';
import { listFriendProfiles } from '@/features/friends/friends.queries';
import type { MatchProvider, SummonerProfile } from '@/features/matches/types';
import {
  findOrCreateScoutPlayer,
  loadScoutPlayerStats,
  parseScoutRiotId,
} from '@/features/scout/player';

const NOW = new Date('2026-09-16T12:00:00Z');
const riotId = { gameName: 'Rival Anónimo', tagLine: 'TAG1' };

const profile: SummonerProfile = {
  puuid: 'puuid-anonimo',
  gameName: riotId.gameName,
  tagLine: riotId.tagLine,
  level: 123,
  profileImageUrl: null,
  ranks: [],
  seasonChampions: [],
};

function provider(): MatchProvider & {
  listMatches: ReturnType<typeof vi.fn>;
  getProfile: ReturnType<typeof vi.fn>;
} {
  return {
    name: 'fake',
    listMatches: vi.fn(async () => []),
    getProfile: vi.fn(async () => profile),
    getMatchDetail: vi.fn(async () => {
      throw new Error('no usado');
    }),
  };
}

let db: Db;

beforeEach(() => {
  const sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

describe('caché de Scout', () => {
  it('valida el formato nombre#tag', () => {
    expect(parseScoutRiotId('Rival Anónimo#TAG1')).toMatchObject({ ok: true, riotId });
    expect(parseScoutRiotId('sin-tag')).toMatchObject({ ok: false });
  });

  it('crea una fila interna estable que no aparece como miembro', () => {
    const first = findOrCreateScoutPlayer(db, riotId, NOW);
    const second = findOrCreateScoutPlayer(db, { gameName: 'rival anónimo', tagLine: 'tag1' }, NOW);

    expect(second.id).toBe(first.id);
    expect(db.select().from(users).all()).toHaveLength(1);
    expect(listFriendProfiles(db)).toEqual([]);
  });

  it('reutiliza la ventana de caché de player-stats', async () => {
    const source = provider();
    await loadScoutPlayerStats(db, source, riotId, NOW, () => {});
    await loadScoutPlayerStats(db, source, riotId, new Date(NOW.getTime() + 60_000), () => {});

    expect(source.listMatches).toHaveBeenCalledTimes(1);
    expect(source.getProfile).toHaveBeenCalledTimes(1);
  });
});
