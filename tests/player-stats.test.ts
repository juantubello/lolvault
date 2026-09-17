import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MATCHES_FORCE_REFRESH_MS,
  MATCHES_REFRESH_MS,
  MATCHES_RETRY_AFTER_ERROR_MS,
} from '@/config';
import { applyPragmas, createDb, type Db } from '@/db/client';
import { users } from '@/db/schema';
import {
  FORCE_REFRESH_RATE_LIMIT_MESSAGE,
  errorKind,
  loadMatchDetail,
  loadPlayerStats,
  refreshPlayerStats,
} from '@/features/matches/player-stats';
import {
  MatchProviderError,
  type MatchDetail,
  type MatchProvider,
  type PlayerMatchSummary,
  type SummonerProfile,
} from '@/features/matches/types';

class MatchProviderErrorFromAnotherModule extends Error {
  readonly name = 'MatchProviderError';
  readonly isMatchProviderError = true;

  constructor(
    message: string,
    readonly kind: 'not-found' | 'unavailable' | 'invalid-response',
  ) {
    super(message);
  }
}

const NOW = new Date('2026-09-15T12:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);

function summary(matchId: string, puuid = 'puuid-a'): PlayerMatchSummary {
  return {
    matchId,
    playedAt: new Date('2026-09-14T21:00:00Z'),
    queue: 'FLEXRANKED',
    durationSeconds: 1800,
    puuid,
    championId: 90,
    championName: 'Malzahar',
    position: 'MID',
    teamKey: 'BLUE',
    kills: 7,
    deaths: 6,
    assists: 5,
    championLevel: 17,
    cs: 267,
    damageDealt: 24108,
    damageTaken: 19354,
    teamKills: 26,
    win: true,
    result: 'WIN',
    opScore: 3.81,
    opScoreRank: 9,
  };
}

const profile: SummonerProfile = {
  puuid: 'puuid-a',
  gameName: 'Invocador',
  tagLine: 'LAS1',
  level: 150,
  profileImageUrl: null,
  ranks: [{ queue: 'FLEXRANKED', tier: 'PLATINUM', division: 4, lp: 93, wins: 55, losses: 52, tierImageUrl: null }],
  seasonChampions: [],
  previousSeasons: [{ seasonId: 31, tier: 'GOLD', division: 2, lp: 40 }],
  ladder: { rank: 1234, total: 3_000_000 },
  rankedSeason: { queue: 'RANKED', seasonId: 33, games: 107, wins: 55, losses: 52, champions: [] },
};

const detail: MatchDetail = {
  matchId: 'm1',
  playedAt: '2026-09-14T21:51:50.000Z',
  queue: 'FLEXRANKED',
  durationSeconds: 2220,
  teams: [],
};

function fakeProvider(): MatchProvider & {
  listMatches: ReturnType<typeof vi.fn>;
  getProfile: ReturnType<typeof vi.fn>;
  getMatchDetail: ReturnType<typeof vi.fn>;
} {
  return {
    name: 'fake',
    listMatches: vi.fn(async () => [summary('m1'), summary('m2')]),
    getProfile: vi.fn(async () => profile),
    getMatchDetail: vi.fn(async () => detail),
  };
}

let db: Db;
let user: { id: number; riotGameName: string | null; riotTagLine: string | null };

beforeEach(() => {
  const sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  const row = db
    .insert(users)
    .values({
      externalIdentity: 'test:a',
      email: 'a@example.com',
      displayName: 'Invocador',
      riotGameName: 'Invocador',
      riotTagLine: 'LAS1',
      createdAt: NOW,
    })
    .returning()
    .get();
  user = { id: row.id, riotGameName: row.riotGameName, riotTagLine: row.riotTagLine };
});

describe('loadPlayerStats', () => {
  it('reconoce errores del proveedor creados por otra copia del módulo', () => {
    const error = new MatchProviderErrorFromAnotherModule('Summoner not found', 'not-found');

    expect(error).not.toBeInstanceOf(MatchProviderError);
    expect(errorKind(error)).toBe('not-found');
  });

  it('sin Riot ID no consulta la fuente', async () => {
    const provider = fakeProvider();
    const state = await loadPlayerStats(db, provider, { ...user, riotGameName: null }, NOW);
    expect(state).toEqual({ status: 'no-riot-id' });
    expect(provider.listMatches).not.toHaveBeenCalled();
  });

  it('la primera vez consulta y guarda partidas y perfil', async () => {
    const provider = fakeProvider();
    const state = await loadPlayerStats(db, provider, user, NOW);

    expect(state.status).toBe('ok');
    if (state.status !== 'ok') return;
    expect(state.matches.map((m) => m.matchId).sort()).toEqual(['m1', 'm2']);
    expect(state.details).toEqual([]);
    expect(state.profile?.ranks[0]?.tier).toBe('PLATINUM');
    expect(state.profile?.previousSeasons?.[0]?.tier).toBe('GOLD');
    expect(state.profile?.ladder).toEqual({ rank: 1234, total: 3_000_000 });
    expect(state.profile?.rankedSeason).toMatchObject({ games: 107, wins: 55, losses: 52 });
    expect(state.syncedAt).toEqual(NOW);
    expect(state.error).toBeNull();
  });

  it('entrega los detalles cacheados para el análisis sin volver a pedirlos', async () => {
    const provider = fakeProvider();
    await loadPlayerStats(db, provider, user, NOW);
    await loadMatchDetail(
      db,
      provider,
      { matchId: 'm1', playedAt: new Date(detail.playedAt) },
      { gameName: 'Invocador', tagLine: 'LAS1' },
      NOW,
    );

    const state = await loadPlayerStats(db, provider, user, at(1));

    expect(state.status === 'ok' && state.details).toEqual([detail]);
    expect(provider.getMatchDetail).toHaveBeenCalledTimes(1);
  });

  it('dentro de la ventana de refresco usa el caché sin volver a pedir', async () => {
    const provider = fakeProvider();
    await loadPlayerStats(db, provider, user, NOW);
    await loadPlayerStats(db, provider, user, at(MATCHES_REFRESH_MS - 1));
    expect(provider.listMatches).toHaveBeenCalledTimes(1);

    await loadPlayerStats(db, provider, user, at(MATCHES_REFRESH_MS));
    expect(provider.listMatches).toHaveBeenCalledTimes(2);
  });

  it('el refresco forzado saltea la ventana normal de 10 minutos', async () => {
    const provider = fakeProvider();
    await loadPlayerStats(db, provider, user, NOW);

    const result = await refreshPlayerStats(db, provider, user, at(MATCHES_FORCE_REFRESH_MS), () => {});

    expect(result).toEqual({ ok: true });
    expect(provider.listMatches).toHaveBeenCalledTimes(2);
    expect(provider.getProfile).toHaveBeenCalledTimes(2);
  });

  it('el refresco forzado respeta el límite de 60 segundos sin llamar a OP.GG', async () => {
    const provider = fakeProvider();
    await loadPlayerStats(db, provider, user, NOW);

    const result = await refreshPlayerStats(
      db,
      provider,
      user,
      at(MATCHES_FORCE_REFRESH_MS - 1),
      () => {},
    );

    expect(result).toEqual({ ok: false, error: FORCE_REFRESH_RATE_LIMIT_MESSAGE });
    expect(provider.listMatches).toHaveBeenCalledTimes(1);
    expect(provider.getProfile).toHaveBeenCalledTimes(1);
  });

  it('si la fuente cae, muestra lo guardado con aviso y espera antes de reintentar', async () => {
    const provider = fakeProvider();
    await loadPlayerStats(db, provider, user, NOW);

    provider.listMatches.mockRejectedValue(new MatchProviderError('503', 'unavailable'));
    provider.getProfile.mockRejectedValue(new MatchProviderError('503', 'unavailable'));
    const failedAt = at(MATCHES_REFRESH_MS);
    const state = await loadPlayerStats(db, provider, user, failedAt);

    expect(state.status === 'ok' && state.matches).toHaveLength(2);
    expect(state.status === 'ok' && state.error).toMatch(/no respondió/);
    expect(state.status === 'ok' && state.syncedAt).toEqual(NOW);

    await loadPlayerStats(db, provider, user, new Date(failedAt.getTime() + MATCHES_RETRY_AFTER_ERROR_MS - 1));
    expect(provider.listMatches).toHaveBeenCalledTimes(2);
  });

  it('el refresco forzado saltea la espera de 5 minutos después de un error', async () => {
    const provider = fakeProvider();
    provider.listMatches.mockRejectedValueOnce(new MatchProviderError('503', 'unavailable'));
    provider.getProfile.mockRejectedValueOnce(new MatchProviderError('503', 'unavailable'));
    await loadPlayerStats(db, provider, user, NOW);

    const result = await refreshPlayerStats(db, provider, user, at(MATCHES_FORCE_REFRESH_MS), () => {});

    expect(result).toEqual({ ok: true });
    expect(provider.listMatches).toHaveBeenCalledTimes(2);
  });

  it('marca Riot ID no encontrado', async () => {
    const provider = fakeProvider();
    provider.listMatches.mockRejectedValue(new MatchProviderError('Summoner not found', 'not-found'));
    provider.getProfile.mockRejectedValue(new MatchProviderError('Summoner not found', 'not-found'));

    const state = await loadPlayerStats(db, provider, user, NOW);
    expect(state.status === 'ok' && state.notFound).toBe(true);
    expect(state.status === 'ok' && state.matches).toEqual([]);
  });

  it('si cambia el Riot ID vuelve a consultar y no mezcla partidas de otra cuenta', async () => {
    const provider = fakeProvider();
    await loadPlayerStats(db, provider, user, NOW);

    provider.listMatches.mockResolvedValue([summary('m9', 'puuid-b')]);
    provider.getProfile.mockResolvedValue({ ...profile, puuid: 'puuid-b' });
    const state = await loadPlayerStats(db, provider, { ...user, riotGameName: 'OtraCuenta' }, at(60_000));

    expect(provider.listMatches).toHaveBeenCalledTimes(2);
    expect(state.status === 'ok' && state.matches.map((m) => m.matchId)).toEqual(['m9']);
  });
});

describe('loadMatchDetail', () => {
  it('guarda el detalle y no lo vuelve a pedir', async () => {
    const provider = fakeProvider();
    const match = { matchId: 'm1', playedAt: new Date('2026-09-14T21:51:50Z') };
    const focus = { gameName: 'Invocador', tagLine: 'LAS1' };

    expect(await loadMatchDetail(db, provider, match, focus, NOW)).toEqual(detail);
    expect(await loadMatchDetail(db, provider, match, focus, NOW)).toEqual(detail);
    expect(provider.getMatchDetail).toHaveBeenCalledTimes(1);
  });

  it('devuelve null si la fuente no responde y no hay caché', async () => {
    const provider = fakeProvider();
    provider.getMatchDetail.mockRejectedValue(new MatchProviderError('timeout', 'unavailable'));
    expect(
      await loadMatchDetail(db, provider, { matchId: 'x', playedAt: NOW }, { gameName: 'a', tagLine: 'b' }, NOW),
    ).toBeNull();
  });
});
