import { describe, expect, it } from 'vitest';

import {
  countByPlayer,
  daysLeft,
  filterVaults,
  groupByPlayer,
  hasActiveFilters,
  isExpiringSoon,
  parseVaultFilters,
  vaultsHref,
  type VaultFilters,
} from '@/features/vaults/vault-filters';
import { addDays, startOfLocalDay } from '@/features/vaults/vault-dates';
import type { Member, VaultCard } from '@/features/vaults/vaults.queries';

const members: Member[] = [
  { id: 1, displayName: 'Juan', avatarUrl: null },
  { id: 2, displayName: 'Cami', avatarUrl: '/avatars/2?v=1' },
  { id: 3, displayName: 'Tincho', avatarUrl: null },
];
const memberIds = new Set(members.map((member) => member.id));

// 20/09/2026 12:00 en Argentina.
const now = new Date('2026-09-20T15:00:00Z');
const today = startOfLocalDay('2026-09-20')!;

function card(
  id: number,
  targetId: number,
  championName: string,
  status: VaultCard['status'],
  daysUntilEnd = 10,
): VaultCard {
  return {
    id,
    status,
    target: { id: targetId, name: `Jugador ${targetId}`, avatarUrl: null },
    champion: { id: championName, name: championName, imageUrl: `/${championName}.png` },
    startsAt: addDays(today, -3),
    endsAt: addDays(today, daysUntilEnd),
    liftedAt: null,
    reason: null,
    liftVoteOpen: false,
  };
}

const vaults = {
  inForce: [
    card(1, 1, 'Yasuo', 'active', 1),
    card(2, 2, "Kai'Sa", 'scheduled'),
    card(3, 1, 'Ahri', 'active', 2),
    card(6, 3, 'Lux', 'active', 3),
  ],
  past: [card(4, 1, 'Yone', 'served', -2), card(5, 3, 'Teemo', 'lifted', 1)],
};

const base: VaultFilters = { playerId: null, status: 'vigentes', query: '' };

describe('parseVaultFilters', () => {
  it('sin parámetros usa los defaults', () => {
    expect(parseVaultFilters({}, memberIds)).toEqual(base);
  });

  it('lee jugador, estado y búsqueda', () => {
    expect(parseVaultFilters({ jugador: '2', estado: 'por-expirar', q: '  kai ' }, memberIds)).toEqual({
      playerId: 2,
      status: 'por-expirar',
      query: 'kai',
    });
  });

  it('ignora jugadores que no son del grupo y estados inventados', () => {
    expect(parseVaultFilters({ jugador: '99', estado: 'hackeado' }, memberIds)).toMatchObject({
      playerId: null,
      status: 'vigentes',
    });
    expect(parseVaultFilters({ jugador: ['abc', '2'] }, memberIds).playerId).toBeNull();
  });
});

describe('vaultsHref', () => {
  it('omite los defaults y arma la query con el resto', () => {
    expect(vaultsHref(base)).toBe('/vaults');
    expect(vaultsHref({ playerId: 2, status: 'terminados', query: 'yas' })).toBe(
      '/vaults?jugador=2&estado=terminados&q=yas',
    );
    expect(hasActiveFilters(base)).toBe(false);
    expect(hasActiveFilters({ ...base, status: 'todos' })).toBe(true);
  });
});

describe('filterVaults', () => {
  it('filtra por estado', () => {
    expect(filterVaults(vaults, base, now).map((c) => c.id)).toEqual([1, 2, 3, 6]);
    expect(filterVaults(vaults, { ...base, status: 'terminados' }, now).map((c) => c.id)).toEqual([4, 5]);
    expect(filterVaults(vaults, { ...base, status: 'todos' }, now)).toHaveLength(6);
  });

  it('filtra por jugador', () => {
    expect(filterVaults(vaults, { ...base, playerId: 1, status: 'todos' }, now).map((c) => c.id)).toEqual([
      1, 3, 4,
    ]);
  });

  it('busca campeones sin tildes, mayúsculas ni símbolos', () => {
    expect(filterVaults(vaults, { ...base, query: 'KAISA' }, now).map((c) => c.id)).toEqual([2]);
    expect(filterVaults(vaults, { ...base, status: 'todos', query: 'yo' }, now).map((c) => c.id)).toEqual([4]);
  });
});

describe('por expirar', () => {
  it('cuenta los días que quedan incluyendo hoy', () => {
    expect(daysLeft(card(0, 1, 'X', 'active', 1), now)).toBe(1); // termina hoy
    expect(daysLeft(card(0, 1, 'X', 'active', 2), now)).toBe(2); // termina mañana
  });

  it('solo incluye vigentes que terminan hoy o mañana', () => {
    expect(filterVaults(vaults, { ...base, status: 'por-expirar' }, now).map((c) => c.id)).toEqual([1, 3]);
  });

  it('un vault terminado no está por expirar aunque su fecha sea cercana', () => {
    expect(isExpiringSoon(card(5, 3, 'Teemo', 'lifted', 1), now)).toBe(false);
  });

  it('a la noche sigue contando por fecha argentina, no UTC', () => {
    // 20/09 23:30 AR = 21/09 02:30 UTC: el vault que termina "hoy" sigue siendo de hoy.
    const lateNight = new Date('2026-09-21T02:30:00Z');
    expect(daysLeft(card(0, 1, 'X', 'active', 1), lateNight)).toBe(1);
  });
});

describe('groupByPlayer y countByPlayer', () => {
  it('agrupa en el orden de los miembros y saltea a quien no tiene vaults', () => {
    const groups = groupByPlayer(vaults.inForce, members);
    expect(groups.map((group) => [group.member.id, group.cards.map((c) => c.id)])).toEqual([
      [1, [1, 3]],
      [2, [2]],
      [3, [6]],
    ]);
  });

  it('cuenta vaults por jugador', () => {
    expect(Object.fromEntries(countByPlayer(vaults.inForce))).toEqual({ 1: 2, 2: 1, 3: 1 });
  });
});
