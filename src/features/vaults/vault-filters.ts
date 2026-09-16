/**
 * Filtros del segmento Vaults. Viven en la URL
 * (`/castigos?tipo=vaults&jugador=2&estado=todos&q=yas`): así
 * funcionan "atrás", compartir el link y el render en el servidor, sin estado en el cliente.
 */
import { VAULT_EXPIRING_DAYS } from '@/config';
import { searchKey } from '@/features/champions/search-key';

import { daysBetween, startOfLocalDay, toLocalDateString } from './vault-dates';
import { isVaultInForce } from './vault-rules';
import type { Member, VaultCard } from './vaults.queries';

export type VaultStatusFilter = 'vigentes' | 'por-expirar' | 'terminados' | 'todos';

export type VaultFilters = {
  playerId: number | null;
  status: VaultStatusFilter;
  query: string;
};

export const STATUS_FILTERS: { value: VaultStatusFilter; label: string }[] = [
  { value: 'vigentes', label: 'Vigentes' },
  { value: 'por-expirar', label: 'Por expirar' },
  { value: 'terminados', label: 'Terminados' },
  { value: 'todos', label: 'Todos' },
];

const STATUS_VALUES = new Set<string>(STATUS_FILTERS.map((option) => option.value));
const QUERY_MAX_LENGTH = 40;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Cualquier valor desconocido cae en el default: la URL nunca rompe la pantalla. */
export function parseVaultFilters(params: SearchParams, memberIds: ReadonlySet<number>): VaultFilters {
  const playerId = Number(first(params.jugador));
  const status = first(params.estado) ?? '';

  return {
    playerId: Number.isInteger(playerId) && memberIds.has(playerId) ? playerId : null,
    status: STATUS_VALUES.has(status) ? (status as VaultStatusFilter) : 'vigentes',
    query: (first(params.q) ?? '').trim().slice(0, QUERY_MAX_LENGTH),
  };
}

/** Link con los filtros dados; omite los defaults para que las URLs queden cortas. */
export function vaultsHref(filters: VaultFilters): string {
  const params = new URLSearchParams({ tipo: 'vaults' });
  if (filters.playerId !== null) params.set('jugador', String(filters.playerId));
  if (filters.status !== 'vigentes') params.set('estado', filters.status);
  if (filters.query) params.set('q', filters.query);

  return `/castigos?${params.toString()}`;
}

export function hasActiveFilters(filters: VaultFilters): boolean {
  return vaultsHref(filters) !== '/castigos?tipo=vaults';
}

/** Días que le quedan contando hoy (hora argentina): 1 = termina hoy, 2 = termina mañana. */
export function daysLeft(card: Pick<VaultCard, 'endsAt'>, now: Date): number {
  const today = startOfLocalDay(toLocalDateString(now)) ?? now;
  return daysBetween(today, card.endsAt);
}

export function isExpiringSoon(card: Pick<VaultCard, 'endsAt' | 'status'>, now: Date): boolean {
  return isVaultInForce(card.status) && daysLeft(card, now) <= VAULT_EXPIRING_DAYS;
}

export function filterVaults(
  vaults: { inForce: VaultCard[]; past: VaultCard[] },
  filters: VaultFilters,
  now: Date,
): VaultCard[] {
  const pools: Record<VaultStatusFilter, () => VaultCard[]> = {
    vigentes: () => vaults.inForce,
    // inForce ya viene ordenado por fecha de fin: el que termina primero, arriba.
    'por-expirar': () => vaults.inForce.filter((card) => isExpiringSoon(card, now)),
    terminados: () => vaults.past,
    todos: () => [...vaults.inForce, ...vaults.past],
  };
  const key = searchKey(filters.query);

  return pools[filters.status]().filter(
    (card) =>
      (filters.playerId === null || card.target.id === filters.playerId) &&
      (!key || searchKey(card.champion.name).includes(key)),
  );
}

/** Agrupa por jugador en el orden de los miembros, sin grupos vacíos. */
export function groupByPlayer(
  cards: VaultCard[],
  members: Member[],
): { member: Member; cards: VaultCard[] }[] {
  return members
    .map((member) => ({ member, cards: cards.filter((card) => card.target.id === member.id) }))
    .filter((group) => group.cards.length > 0);
}

export function countByPlayer(cards: VaultCard[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.target.id, (counts.get(card.target.id) ?? 0) + 1);
  return counts;
}
