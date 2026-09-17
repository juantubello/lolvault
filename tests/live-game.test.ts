import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { buildDraftMatrix, type DraftChampionStatRow } from '@/features/draft/analysis';
import { createLiveCaptureToken, verifyLiveCaptureToken } from '@/features/scout/live-capture';
import {
  getLiveGameProvider,
  inferTeamRoles,
  liveGameToDraft,
} from '@/features/scout/live-game';
import { liveDraftErrorState } from '@/features/scout/live-game-state';
import {
  createSpectatorClient,
  SpectatorClientError,
  type SpectatorGame,
} from '@/features/scout/spectator-client';

const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/riot/spectator-active-game.json', import.meta.url),
  'utf8',
)) as SpectatorGame;

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function matrix(stats: DraftChampionStatRow[]) {
  return buildDraftMatrix({
    championKeys: Array.from({ length: 10 }, (_, index) => index + 1),
    championStats: stats,
    matchups: [],
    synergies: [],
  });
}

const roles = ['top', 'jungle', 'middle', 'bottom', 'support'] as const;
const obviousStats: DraftChampionStatRow[] = Array.from({ length: 10 }, (_, index) => ({
  championKey: index + 1,
  role: roles[index % 5]!,
  games: 10_000,
  wins: 5_000,
}));

describe('cliente de Spectator-v5', () => {
  it('usa la plataforma LAS, manda la key sólo en el header y cachea un minuto', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response(200, fixture));
    const client = createSpectatorClient({ apiKey: 'key-de-fixture', fetchFn });

    await expect(client.getActiveGame('fixture-blue-1')).resolves.toEqual(fixture);
    await expect(client.getActiveGame('fixture-blue-1')).resolves.toEqual(fixture);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://la2.api.riotgames.com/lol/spectator/v5/active-games/by-puuid/fixture-blue-1');
    expect(new Headers(init?.headers).get('X-Riot-Token')).toBe('key-de-fixture');
    expect(String(url)).not.toContain('key-de-fixture');
  });

  it.each([
    [404, 'not-in-game', 'No estás en una partida'],
    [401, 'invalid-key', 'key de Riot no sirve o venció'],
    [403, 'invalid-key', 'key de Riot no sirve o venció'],
  ] as const)('traduce HTTP %s a un estado de UI específico', async (status, kind, copy) => {
    const client = createSpectatorClient({
      apiKey: 'key-de-fixture',
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(response(status)),
    });

    const error = await client.getActiveGame('fixture-blue-1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpectatorClientError);
    expect((error as SpectatorClientError).kind).toBe(kind);
    const state = liveDraftErrorState(error);
    expect(state.message).toContain(copy);
    expect(state.status).not.toBe('error');
  });

  it('tipa rate limits y caídas de Riot sin exponer excepciones crudas', async () => {
    for (const [status, kind] of [[429, 'rate-limited'], [503, 'unavailable']] as const) {
      const client = createSpectatorClient({
        apiKey: 'key-de-fixture',
        fetchFn: vi.fn<typeof fetch>().mockResolvedValue(response(status)),
      });
      await expect(client.getActiveGame('fixture-blue-1')).rejects.toMatchObject({ kind });
    }
  });
});

describe('LiveGameProvider e inferencia', () => {
  it('sin RIOT_API_KEY devuelve el stub nulo y la pantalla puede seguir con carga manual', async () => {
    await expect(getLiveGameProvider({}).getLiveGame('fixture-puuid')).resolves.toBeNull();
  });

  it('asigna el rol principal obvio de los cinco campeones', () => {
    expect(inferTeamRoles([1, 2, 3, 4, 5], matrix(obviousStats))).toEqual([
      { championKey: 1, role: 'top' },
      { championKey: 2, role: 'jungle' },
      { championKey: 3, role: 'middle' },
      { championKey: 4, role: 'bottom' },
      { championKey: 5, role: 'support' },
    ]);
  });

  it('resuelve dos campeones con el mismo rol principal por suma global, no por llegada', () => {
    const stats: DraftChampionStatRow[] = [
      { championKey: 1, role: 'top', games: 100, wins: 50 },
      { championKey: 1, role: 'jungle', games: 90, wins: 45 },
      { championKey: 2, role: 'top', games: 99, wins: 50 },
      { championKey: 2, role: 'jungle', games: 1, wins: 1 },
      { championKey: 3, role: 'middle', games: 1_000, wins: 500 },
      { championKey: 4, role: 'bottom', games: 1_000, wins: 500 },
      { championKey: 5, role: 'support', games: 1_000, wins: 500 },
    ];

    const inferred = inferTeamRoles([1, 2, 3, 4, 5], matrix(stats));
    expect(inferred.find((pick) => pick.championKey === 1)?.role).toBe('jungle');
    expect(inferred.find((pick) => pick.championKey === 2)?.role).toBe('top');
  });

  it.each([
    ['fixture-blue-1', [1, 2, 3, 4, 5]],
    ['fixture-red-1', [6, 7, 8, 9, 10]],
  ] as const)('pone como aliado al teamId donde está %s', (puuid, allyKeys) => {
    const draft = liveGameToDraft(fixture, puuid, matrix(obviousStats));
    expect(draft.allies.map((pick) => pick.championKey).sort((a, b) => a - b)).toEqual(allyKeys);
  });
});

describe('comprobante de captura en vivo', () => {
  it('queda ligado al usuario y no acepta alteraciones', () => {
    const now = 1789677000000;
    const token = createLiveCaptureToken({
      userId: 7,
      gameId: fixture.gameId,
      gameStartTime: fixture.gameStartTime,
      capturedAt: now,
    }, 'secreto-de-fixture');

    expect(verifyLiveCaptureToken(token, 7, 'secreto-de-fixture', now)).toBe(true);
    expect(verifyLiveCaptureToken(token, 8, 'secreto-de-fixture', now)).toBe(false);
    expect(verifyLiveCaptureToken(`${token}alterado`, 7, 'secreto-de-fixture', now)).toBe(false);
  });
});
