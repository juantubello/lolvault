import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createLolalyticsScalingSource } from '@/features/draft/lolalytics/lolalytics-scaling-source';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/lolalytics/${name}`, import.meta.url),
  'utf8',
);

const input = {
  championKey: 103,
  championId: 'Ahri',
  role: 'middle' as const,
  patchWindow: '30',
};

describe('fuente de scaling de Lolalytics', () => {
  it('entrega conteos crudos desde q-data', async () => {
    const source = createLolalyticsScalingSource({
      client: { getQData: vi.fn(async () => fixture('qdata-ahri-middle.full.json')) },
    });

    const series = await source.getScaling(input);

    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ bucket: 1, games: 5_119, wins: 2_547 });
  });

  it('convierte una forma sin serie en invalid-response', async () => {
    const source = createLolalyticsScalingSource({
      client: { getQData: vi.fn(async () => '{"status":404}') },
    });

    await expect(source.getScaling(input)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
});
