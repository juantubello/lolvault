import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MATCHES_REFRESH_MS } from '@/config';
import { applyPragmas, createDb, type Db } from '@/db/client';
import { users } from '@/db/schema';
import { listFriendProfiles } from '@/features/friends/friends.queries';
import {
  MatchProviderError,
  type MatchProvider,
  type SummonerProfile,
} from '@/features/matches/types';
import {
  loadScoutPlayerStats,
  parseScoutRegion,
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

  it('normaliza la región y usa la configurada por defecto si no es válida', () => {
    expect(parseScoutRegion('kr')).toBe('KR');
    expect(parseScoutRegion(undefined)).toBe('LAS');
    expect(parseScoutRegion('inventada')).toBe('LAS');
    // Los códigos de plataforma (LA2, NA1…) no se ofrecen en el selector y caen al default.
    // Para LA2 da igual: es la misma región que LAS.
    expect(parseScoutRegion('la2')).toBe('LAS');
  });

  it('crea la fila interna recién después de confirmar el perfil y no aparece como miembro', async () => {
    const source = provider();
    const loaded = await loadScoutPlayerStats(db, source, riotId, 'LAS', NOW, () => {});

    expect(loaded.status).toBe('loaded');
    expect(source.getProfile).toHaveBeenCalledTimes(1);
    expect(db.select().from(users).all()).toHaveLength(1);
    expect(listFriendProfiles(db)).toEqual([]);
  });

  it('no crea una fila si la fuente no encuentra el Riot ID', async () => {
    const source = provider();
    source.getProfile.mockRejectedValue(new MatchProviderError('Summoner not found', 'not-found'));

    const loaded = await loadScoutPlayerStats(db, source, riotId, 'LAS', NOW, () => {});

    expect(loaded).toEqual({ status: 'not-found' });
    expect(source.listMatches).not.toHaveBeenCalled();
    expect(db.select().from(users).all()).toEqual([]);
  });

  it('separa el caché del mismo Riot ID por región', async () => {
    await loadScoutPlayerStats(db, provider(), riotId, 'LAS', NOW, () => {});
    await loadScoutPlayerStats(db, provider(), riotId, 'KR', NOW, () => {});

    const rows = db.select().from(users).all();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.externalIdentity)).size).toBe(2);
  });

  it('reutiliza la ventana de caché de player-stats', async () => {
    const source = provider();
    await loadScoutPlayerStats(db, source, riotId, 'LAS', NOW, () => {});
    await loadScoutPlayerStats(db, source, riotId, 'LAS', new Date(NOW.getTime() + 60_000), () => {});

    expect(source.listMatches).toHaveBeenCalledTimes(1);
    expect(source.getProfile).toHaveBeenCalledTimes(1);
  });

  it('conserva el caché existente si la fuente queda unavailable', async () => {
    const source = provider();
    await loadScoutPlayerStats(db, source, riotId, 'LAS', NOW, () => {});
    source.listMatches.mockRejectedValue(new MatchProviderError('503', 'unavailable'));
    source.getProfile.mockRejectedValue(new MatchProviderError('503', 'unavailable'));

    const loaded = await loadScoutPlayerStats(
      db,
      source,
      riotId,
      'LAS',
      new Date(NOW.getTime() + MATCHES_REFRESH_MS),
      () => {},
    );

    expect(loaded.status).toBe('loaded');
    expect(loaded.status === 'loaded' && loaded.stats.profile).toEqual(profile);
    expect(loaded.status === 'loaded' && loaded.stats.error).toMatch(/no respondió/);
    expect(db.select().from(users).all()).toHaveLength(1);
  });
});
