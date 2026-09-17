import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/auth/current-user', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 1, displayName: 'Persona' })),
}));
vi.mock('@/components/scout/player-segment', () => ({ ScoutPlayerSegment: () => null }));
vi.mock('@/components/scout/draft-segment', () => ({ DraftSegment: () => null }));

import ScoutPage from '@/app/(app)/scout/page';
import { parseScoutType, scoutHref } from '@/features/scout/routes';

describe('rutas de Scout', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('reconoce solamente los dos segmentos válidos', () => {
    expect(parseScoutType('jugador')).toBe('jugador');
    expect(parseScoutType(['draft', 'jugador'])).toBe('draft');
    expect(parseScoutType('otro')).toBeNull();
  });

  it('conserva los demás parámetros al cambiar de segmento', () => {
    expect(scoutHref('draft', { jugador: 'Ahri#LAS', region: 'LAS' })).toBe(
      '/scout?tipo=draft&jugador=Ahri%23LAS&region=LAS',
    );
  });

  it('/scout sin tipo redirige a Jugador y conserva la query', async () => {
    await expect(ScoutPage({
      searchParams: Promise.resolve({ jugador: 'Ahri#LAS', region: 'LAS' }),
    })).rejects.toThrow('redirect:/scout?tipo=jugador&jugador=Ahri%23LAS&region=LAS');
    expect(redirectMock).toHaveBeenCalledWith(
      '/scout?tipo=jugador&jugador=Ahri%23LAS&region=LAS',
    );
  });
});
