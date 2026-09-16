import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createLolalyticsProvider } from '@/features/draft/lolalytics/lolalytics-provider';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/lolalytics/${name}`, import.meta.url),
  'utf8',
);

describe('proveedor de Draft de Lolalytics', () => {
  it('convierte n y vsWr a conteos de victorias', async () => {
    const provider = createLolalyticsProvider({
      client: {
        getCounter: vi.fn(async () => fixture('counter-ahri-middle-vs-middle.json')),
        getTeam: vi.fn(),
      },
    });

    const result = await provider.getMatchups({
      championKey: 103,
      championId: 'Ahri',
      role: 'middle',
      enemyRole: 'middle',
      patchWindow: '30',
    });

    expect(result.stats).toEqual({
      championKey: 103,
      role: 'middle',
      games: 111_534,
      wins: 58_957,
    });
    expect(result.matchups[0]).toEqual({
      enemyChampionKey: 81,
      enemyRole: 'middle',
      games: 204,
      wins: 133,
    });
  });

  it('convierte n y wr de sinergias a conteos', async () => {
    const provider = createLolalyticsProvider({
      client: {
        getCounter: vi.fn(),
        getTeam: vi.fn(async () => fixture('build-team-ahri-middle.json')),
      },
    });

    const rows = await provider.getSynergies({
      championKey: 103,
      championId: 'Ahri',
      role: 'middle',
      patchWindow: '30',
    });

    expect(rows[0]).toEqual({
      allyChampionKey: 777,
      allyRole: 'top',
      games: 5261,
      wins: 2783,
    });
  });

  it('clasifica los cuerpos 404 y no JSON sin mirar sólo el status HTTP', async () => {
    const getCounter = vi.fn(async () => fixture('counter-campeon-inexistente.json'));
    const provider = createLolalyticsProvider({ client: { getCounter, getTeam: vi.fn() } });
    const input = {
      championKey: 999999,
      championId: 'CampeonInexistente',
      role: 'middle' as const,
      enemyRole: 'middle' as const,
      patchWindow: '30',
    };

    await expect(provider.getMatchups(input)).rejects.toMatchObject({ kind: 'not-found' });
    getCounter.mockResolvedValueOnce(fixture('invalid-end-point.txt'));
    await expect(provider.getMatchups(input)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
});
