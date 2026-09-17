import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseQwikScalingData } from '@/features/draft/lolalytics/qwik-data';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/lolalytics/${name}`, import.meta.url),
  'utf8',
);

function synthetic(options: {
  games?: unknown[];
  wins?: unknown[];
  container?: Record<string, unknown>;
} = {}): string {
  const games = options.games ?? [10, 20, 30, 40, 50, 60, 70];
  const wins = options.wins ?? [5, 10, 15, 20, 25, 30, 35];
  const objects: unknown[] = [
    options.container ?? { time: '1', timeWin: '9' },
    Object.fromEntries(games.map((_, index) => [String(index + 1), (index + 2).toString(36)])),
    ...games,
    Object.fromEntries(wins.map((_, index) => [String(index + 1), (index + 10).toString(36)])),
    ...wins,
  ];
  return JSON.stringify({ _objs: objects });
}

describe('parser Qwik de scaling', () => {
  it.each([
    'qdata-ahri-middle.min.json',
    'qdata-ahri-middle.full.json',
  ])('encuentra la misma serie de Ahri sin asumir un índice en %s', (name) => {
    const parsed = parseQwikScalingData(fixture(name));

    expect(parsed).toEqual({
      ok: true,
      series: [
        { bucket: 1, games: 5_119, wins: 2_547 },
        { bucket: 2, games: 42_853, wins: 21_169 },
        { bucket: 3, games: 86_465, wins: 45_340 },
        { bucket: 4, games: 176_666, wins: 94_784 },
        { bucket: 5, games: 144_312, wins: 76_711 },
        { bucket: 6, games: 61_763, wins: 32_470 },
        { bucket: 7, games: 22_236, wins: 11_700 },
      ],
    });
  });

  it('lee la curva fuerte de Kayle con los valores medidos', () => {
    const parsed = parseQwikScalingData(fixture('qdata-kayle-top.min.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.series[2]).toEqual({ bucket: 3, games: 20_562, wins: 8_407 });
    expect(parsed.series[5]).toEqual({ bucket: 6, games: 15_049, wins: 9_218 });
    expect(parsed.series[2]!.wins / parsed.series[2]!.games).toBeCloseTo(0.4089, 4);
    expect(parsed.series[5]!.wins / parsed.series[5]!.games).toBeCloseTo(0.6125, 4);
  });

  it('lee la curva real de Thresh', () => {
    const parsed = parseQwikScalingData(fixture('qdata-thresh-support.min.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.series).toHaveLength(7);
    expect(parsed.series[2]!.wins / parsed.series[2]!.games).toBeCloseTo(0.5415, 4);
    expect(parsed.series[5]!.wins / parsed.series[5]!.games).toBeCloseTo(0.5289, 4);
  });

  it.each([
    [{}, 'missing-objs'],
    [{ _objs: {} }, 'invalid-objs'],
    [{ _objs: [1, 2, 3] }, 'missing-series-container'],
  ])('explica una estructura base inválida', (value, reason) => {
    expect(parseQwikScalingData(value)).toMatchObject({ ok: false, reason });
  });

  it('rechaza punteros fuera de rango', () => {
    expect(parseQwikScalingData(JSON.stringify({
      _objs: [{ time: 'z', timeWin: '1' }, {}],
    }))).toMatchObject({ ok: false, reason: 'pointer-out-of-range' });
  });

  it('rechaza distinta cantidad de tramos', () => {
    expect(parseQwikScalingData(synthetic({ wins: [5, 10, 15, 20, 25, 30] })))
      .toMatchObject({ ok: false, reason: 'mismatched-buckets' });
  });

  it('rechaza un tramo con cero partidas', () => {
    expect(parseQwikScalingData(synthetic({ games: [10, 20, 0, 40, 50, 60, 70] })))
      .toMatchObject({ ok: false, reason: 'zero-games' });
  });

  it('rechaza literales que no sean números', () => {
    expect(parseQwikScalingData(synthetic({ games: [10, 20, 'treinta', 40, 50, 60, 70] })))
      .toMatchObject({ ok: false, reason: 'invalid-number' });
  });
});
