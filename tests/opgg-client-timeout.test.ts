import { describe, expect, it } from 'vitest';

import { createOpggClient } from '@/features/matches/opgg/opgg-client';

describe('cliente de OP.GG', () => {
  it('corta la llamada completa si OP.GG no responde, aunque cada POST tenga su propio timeout', async () => {
    const client = createOpggClient({
      fetchFn: () => new Promise<Response>(() => {}),
      timeoutMs: 60_000,
      totalTimeoutMs: 30,
    });

    await expect(client.callTool('lol_list_summoner_matches', {})).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
