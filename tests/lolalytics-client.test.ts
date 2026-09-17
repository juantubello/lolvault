import { describe, expect, it, vi } from 'vitest';

import { createLolalyticsClient, lolalyticsSlug } from '@/features/draft/lolalytics/lolalytics-client';

describe('cliente de Lolalytics', () => {
  it('arma los tres endpoints con parámetros comunes y un User-Agent identificable', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    const client = createLolalyticsClient({ fetchFn: fetchFn as typeof fetch });

    await client.getCounter({
      championKey: 103,
      championId: 'Ahri',
      role: 'middle',
      enemyRole: 'jungle',
      patchWindow: '30',
    });
    await client.getTeam({ championKey: 103, championId: 'Ahri', role: 'middle', patchWindow: '16.18' });
    await client.getQData({ championKey: 62, championId: 'MonkeyKing', role: 'top', patchWindow: '30' });

    const [counterUrl, counterInit] = fetchFn.mock.calls[0] ?? [];
    expect(counterUrl).toBeInstanceOf(URL);
    expect(Object.fromEntries((counterUrl as URL).searchParams)).toMatchObject({
      v: '1',
      tier: 'emerald_plus',
      queue: 'ranked',
      region: 'all',
      patch: '30',
      c: 'ahri',
      ep: 'counter',
      lane: 'middle',
      vslane: 'jungle',
    });
    expect(counterInit).toMatchObject({
      headers: expect.objectContaining({ 'User-Agent': 'LolVault/1.0 (private app)' }),
      signal: expect.any(AbortSignal),
    });
    const [teamUrl] = fetchFn.mock.calls[1] ?? [];
    expect(Object.fromEntries((teamUrl as URL).searchParams)).toMatchObject({
      ep: 'build-team',
      lane: 'middle',
      patch: '16.18',
      c: 'ahri',
    });
    expect((teamUrl as URL).searchParams.has('vslane')).toBe(false);
    const [qDataUrl] = fetchFn.mock.calls[2] ?? [];
    expect((qDataUrl as URL).toString()).toBe(
      'https://lolalytics.com/lol/wukong/build/q-data.json?tier=emerald_plus&region=all&patch=30&lane=top',
    );
  });

  it('manda el id en minúsculas y traduce MonkeyKing a wukong', () => {
    // Lolalytics rechaza la key numérica (200 con {"status":404}). Probados los 173 campeones
    // contra la fuente, MonkeyKing es el único id que no coincide con Data Dragon.
    expect(lolalyticsSlug('Ahri')).toBe('ahri');
    expect(lolalyticsSlug('MonkeyKing')).toBe('wukong');
  });

  it('corta la operación completa aunque el request individual siga pendiente', async () => {
    const client = createLolalyticsClient({
      fetchFn: () => new Promise<Response>(() => {}),
      timeoutMs: 60_000,
      totalTimeoutMs: 20,
    });

    await expect(client.getTeam({ championKey: 103, championId: 'Ahri', role: 'middle', patchWindow: '30' }))
      .rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('clasifica el 404 HTTP de q-data como campeón inexistente', async () => {
    const client = createLolalyticsClient({
      fetchFn: vi.fn(async () => new Response('{"status":404}', { status: 404 })) as typeof fetch,
    });

    await expect(client.getQData({
      championKey: 999_999,
      championId: 'NoExiste',
      role: 'middle',
      patchWindow: '30',
    })).rejects.toMatchObject({ kind: 'not-found' });
  });
});
