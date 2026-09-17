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
vi.mock('@/components/scout/draft-record-segment', () => ({ DraftRecordSegment: () => null }));

import ScoutPage from '@/app/(app)/scout/page';
import { parseScoutType, scoutHref } from '@/features/scout/routes';

describe('rutas de Scout', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('reconoce solamente los tres segmentos válidos', () => {
    expect(parseScoutType('jugador')).toBe('jugador');
    expect(parseScoutType(['draft', 'jugador'])).toBe('draft');
    expect(parseScoutType('registro')).toBe('registro');
    expect(parseScoutType('otro')).toBeNull();
  });

  it('lleva el draft completo al Registro y de vuelta', () => {
    const query = {
      tipo: 'draft',
      aliados: '86-top,64-jungle,103-middle,222-bottom,412-support',
      enemigos: '1-top,2-jungle,3-middle,4-bottom,5-support',
      riesgo: 'high',
      panel: 'analisis',
    };
    const recordHref = scoutHref('registro', query);
    const recordParams = Object.fromEntries(new URL(recordHref, 'https://local').searchParams);

    expect(recordParams).toMatchObject({
      tipo: 'registro',
      aliados: query.aliados,
      enemigos: query.enemigos,
      riesgo: 'high',
      panel: 'analisis',
    });
    expect(scoutHref('draft', recordParams)).toContain(`aliados=${encodeURIComponent(query.aliados)}`);
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
