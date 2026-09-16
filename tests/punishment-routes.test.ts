import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import LegacyBlacklistPage from '@/app/(app)/black-list/page';
import LegacyVaultsPage from '@/app/(app)/vaults/page';
import { parsePunishmentType, punishmentHref } from '@/features/punishments/routes';

describe('rutas de Ripeados', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('reconoce solamente segmentos válidos', () => {
    expect(parsePunishmentType('vaults')).toBe('vaults');
    expect(parsePunishmentType(['black-list', 'vaults'])).toBe('black-list');
    expect(parsePunishmentType('draft')).toBeNull();
  });

  it('conserva filtros al armar el destino canónico', () => {
    expect(punishmentHref('vaults', { jugador: '2', estado: 'todos' })).toBe(
      '/ripeados?tipo=vaults&jugador=2&estado=todos',
    );
  });

  it('/vaults redirige al segmento Vaults sin perder la query', async () => {
    await expect(
      LegacyVaultsPage({ searchParams: Promise.resolve({ jugador: '2', q: 'yas' }) }),
    ).rejects.toThrow('redirect:/ripeados?tipo=vaults&jugador=2&q=yas');
    expect(redirectMock).toHaveBeenCalledWith('/ripeados?tipo=vaults&jugador=2&q=yas');
  });

  it('/black-list redirige al segmento Black list sin perder la query', async () => {
    await expect(
      LegacyBlacklistPage({ searchParams: Promise.resolve({ q: 'rival' }) }),
    ).rejects.toThrow('redirect:/ripeados?tipo=black-list&q=rival');
    expect(redirectMock).toHaveBeenCalledWith('/ripeados?tipo=black-list&q=rival');
  });
});
