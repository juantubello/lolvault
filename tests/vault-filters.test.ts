import { describe, expect, it } from 'vitest';

import {
  countByPlayer,
  filterVaults,
  groupByPlayer,
  hasActiveFilters,
  parseVaultFilters,
  vaultsHref,
} from '@/features/vaults/vault-filters';
import type { Member, VaultCard } from '@/features/vaults/vaults.queries';

const members: Member[] = [
  { id: 1, displayName: 'Juan', avatarUrl: null },
  { id: 2, displayName: 'Cami', avatarUrl: '/avatars/2?v=1' },
  { id: 3, displayName: 'Tincho', avatarUrl: null },
];
const memberIds = new Set(members.map((member) => member.id));

function card(id: number, targetId: number, championName: string, status: VaultCard['status']): VaultCard {
  const day = new Date('2026-09-20T03:00:00Z');
  return {
    id,
    status,
    target: { id: targetId, name: `Jugador ${targetId}`, avatarUrl: null },
    champion: { id: championName, name: championName, imageUrl: `/${championName}.png` },
    startsAt: day,
    endsAt: day,
    liftedAt: null,
    reason: null,
    liftVoteOpen: false,
  };
}

const vaults = {
  inForce: [card(1, 1, 'Yasuo', 'active'), card(2, 2, "Kai'Sa", 'scheduled'), card(3, 1, 'Ahri', 'active')],
  past: [card(4, 1, 'Yone', 'served'), card(5, 3, 'Teemo', 'lifted')],
};

describe('parseVaultFilters', () => {
  it('sin parámetros usa los defaults', () => {
    expect(parseVaultFilters({}, memberIds)).toEqual({ playerId: null, status: 'vigentes', query: '' });
  });

  it('lee jugador, estado y búsqueda', () => {
    expect(parseVaultFilters({ jugador: '2', estado: 'todos', q: '  kai ' }, memberIds)).toEqual({
      playerId: 2,
      status: 'todos',
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
    expect(vaultsHref({ playerId: null, status: 'vigentes', query: '' })).toBe('/vaults');
    expect(vaultsHref({ playerId: 2, status: 'terminados', query: 'yas' })).toBe(
      '/vaults?jugador=2&estado=terminados&q=yas',
    );
    expect(hasActiveFilters({ playerId: null, status: 'vigentes', query: '' })).toBe(false);
    expect(hasActiveFilters({ playerId: null, status: 'todos', query: '' })).toBe(true);
  });
});

describe('filterVaults', () => {
  const base = { playerId: null, status: 'vigentes' as const, query: '' };

  it('filtra por estado', () => {
    expect(filterVaults(vaults, base).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(filterVaults(vaults, { ...base, status: 'terminados' }).map((c) => c.id)).toEqual([4, 5]);
    expect(filterVaults(vaults, { ...base, status: 'todos' })).toHaveLength(5);
  });

  it('filtra por jugador', () => {
    expect(filterVaults(vaults, { ...base, playerId: 1, status: 'todos' }).map((c) => c.id)).toEqual([1, 3, 4]);
  });

  it('busca campeones sin tildes, mayúsculas ni símbolos', () => {
    expect(filterVaults(vaults, { ...base, query: 'KAISA' }).map((c) => c.id)).toEqual([2]);
    expect(filterVaults(vaults, { ...base, status: 'todos', query: 'yo' }).map((c) => c.id)).toEqual([4]);
  });
});

describe('groupByPlayer y countByPlayer', () => {
  it('agrupa en el orden de los miembros y saltea a quien no tiene vaults', () => {
    const groups = groupByPlayer(vaults.inForce, members);
    expect(groups.map((group) => [group.member.id, group.cards.map((c) => c.id)])).toEqual([
      [1, [1, 3]],
      [2, [2]],
    ]);
  });

  it('cuenta vaults por jugador', () => {
    expect(Object.fromEntries(countByPlayer(vaults.inForce))).toEqual({ 1: 2, 2: 1 });
  });
});
