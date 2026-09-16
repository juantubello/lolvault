import { describe, expect, it } from 'vitest';

import { getLiveGameProvider } from '@/features/scout/live-game';

describe('LiveGameProvider', () => {
  it('devuelve null mientras no haya una fuente autorizada', async () => {
    await expect(getLiveGameProvider().getLiveGame('puuid-anonimo')).resolves.toBeNull();
  });
});
