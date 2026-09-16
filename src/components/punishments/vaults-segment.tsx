import { LockKeyhole, Search, SearchX, Users } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { UserAvatar } from '@/components/user-avatar';
import { ProposeVaultSheet } from '@/components/vaults/propose-vault-sheet';
import { VaultCardView } from '@/components/vaults/vault-card';
import { VAULT_MAX_START_AHEAD_DAYS } from '@/config';
import { getDb } from '@/db/client';
import type { User } from '@/db/schema';
import { listChampionOptions } from '@/features/champions/champions.queries';
import { ensureChampions } from '@/features/champions/ddragon-sync';
import type { RouteSearchParams } from '@/features/punishments/routes';
import { addDays, toLocalDateString } from '@/features/vaults/vault-dates';
import {
  countByPlayer,
  filterVaults,
  groupByPlayer,
  hasActiveFilters,
  parseVaultFilters,
  STATUS_FILTERS,
  vaultsHref,
} from '@/features/vaults/vault-filters';
import { listMembers, listVaults, type VaultCard } from '@/features/vaults/vaults.queries';

import { PunishmentSegments } from './punishment-segments';

function CardList({ cards, grouped = false, now }: { cards: VaultCard[]; grouped?: boolean; now: Date }) {
  return (
    <div className="proposal-list">
      {cards.map((card) => (
        <VaultCardView card={card} grouped={grouped} key={card.id} now={now} />
      ))}
    </div>
  );
}

export async function VaultsSegment({
  searchParams,
  user,
}: {
  searchParams: RouteSearchParams;
  user: User & { displayName: string };
}) {
  const db = getDb();
  const now = new Date();

  try {
    await ensureChampions(db);
  } catch (error) {
    console.error('[champions] No se pudieron cargar desde Data Dragon:', error);
  }

  const members = listMembers(db);
  const vaults = listVaults(db, now);
  const filters = parseVaultFilters(searchParams, new Set(members.map((member) => member.id)));
  const proposeAction = (
    <ProposeVaultSheet
      champions={listChampionOptions(db)}
      maxStartDate={toLocalDateString(addDays(now, VAULT_MAX_START_AHEAD_DAYS))}
      members={members}
      today={toLocalDateString(now)}
      viewerId={user.id}
    />
  );
  const cards = filterVaults(vaults, filters, now);
  const inForceByPlayer = countByPlayer(vaults.inForce);
  const selectedPlayer = members.find((member) => member.id === filters.playerId) ?? null;
  const statusLabel = STATUS_FILTERS.find((option) => option.value === filters.status)?.label ?? '';

  return (
    <Screen action={proposeAction} title="Ripeados">
      <PunishmentSegments selected="vaults" />

      {vaults.inForce.length + vaults.past.length === 0 ? (
        <EmptyState
          description="Proponé el primer vault desde acá. Cuando llegue a 3 votos a favor, va a aparecer en esta lista."
          icon={LockKeyhole}
          title="Todos pueden jugar lo que quieran. Por ahora."
        />
      ) : (
        <>
          <div className="vault-filters">
            <nav aria-label="Filtrar por jugador" className="player-filter">
              <Link
                aria-current={filters.playerId === null ? 'true' : undefined}
                className="player-filter-item"
                href={vaultsHref({ ...filters, playerId: null })}
              >
                <span className="player-filter-avatar player-filter-all">
                  <Users aria-hidden="true" size={22} strokeWidth={2} />
                </span>
                <span className="player-filter-name">Todos</span>
              </Link>

              {members.map((member) => {
                const count = inForceByPlayer.get(member.id) ?? 0;
                return (
                  <Link
                    aria-current={filters.playerId === member.id ? 'true' : undefined}
                    className="player-filter-item"
                    href={vaultsHref({ ...filters, playerId: member.id })}
                    key={member.id}
                  >
                    <span className="player-filter-avatar">
                      <UserAvatar id={member.id} name={member.displayName} size="nav" src={member.avatarUrl} />
                      {count ? <span aria-hidden="true" className="player-filter-count">{count}</span> : null}
                    </span>
                    <span className="player-filter-name">
                      {member.id === user.id ? 'Vos' : member.displayName}
                    </span>
                    <span className="sr-only">
                      , {count} {count === 1 ? 'vault vigente' : 'vaults vigentes'}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <nav aria-label="Estado del vault" className="segmented">
              {STATUS_FILTERS.map((option) => (
                <Link
                  aria-current={filters.status === option.value ? 'true' : undefined}
                  className="segmented-item"
                  href={vaultsHref({ ...filters, status: option.value })}
                  key={option.value}
                >
                  {option.label}
                  <span className="segmented-count">
                    {filterVaults(vaults, { ...filters, status: option.value }, now).length}
                  </span>
                </Link>
              ))}
            </nav>

            <form action="/ripeados" className="vault-search" key={vaultsHref(filters)} role="search">
              <input name="tipo" type="hidden" value="vaults" />
              {filters.playerId !== null ? <input name="jugador" type="hidden" value={filters.playerId} /> : null}
              {filters.status !== 'vigentes' ? <input name="estado" type="hidden" value={filters.status} /> : null}
              <Search aria-hidden="true" size={18} strokeWidth={2} />
              <input
                aria-label="Buscar campeón"
                autoComplete="off"
                defaultValue={filters.query}
                enterKeyHint="search"
                name="q"
                placeholder="Buscar campeón"
                type="search"
              />
              <button className="sr-only" type="submit">Buscar</button>
            </form>

            {hasActiveFilters(filters) ? (
              <Link className="clear-filters" href="/ripeados?tipo=vaults">Limpiar filtros</Link>
            ) : null}
          </div>

          {cards.length === 0 ? (
            <EmptyState
              description={
                selectedPlayer
                  ? `${selectedPlayer.id === user.id ? 'No tenés' : `${selectedPlayer.displayName} no tiene`} vaults en “${statusLabel}”${filters.query ? ` con “${filters.query}”` : ''}.`
                  : 'Probá con otro estado, jugador o campeón.'
              }
              icon={SearchX}
              title="No hay vaults con estos filtros"
            />
          ) : selectedPlayer ? (
            <section aria-labelledby="player-vaults-heading" className="grouped-section">
              <h2 className="player-group-title" id="player-vaults-heading">
                <UserAvatar id={selectedPlayer.id} name={selectedPlayer.displayName} size="sm" src={selectedPlayer.avatarUrl} />
                {selectedPlayer.displayName}
                <span className="player-group-count">
                  {cards.length} {cards.length === 1 ? 'vault' : 'vaults'}
                </span>
              </h2>
              <CardList cards={cards} grouped now={now} />
            </section>
          ) : (
            groupByPlayer(cards, members).map(({ member, cards: playerCards }) => (
              <section aria-labelledby={`player-${member.id}-heading`} className="grouped-section" key={member.id}>
                <h2 className="player-group-title" id={`player-${member.id}-heading`}>
                  <UserAvatar id={member.id} name={member.displayName} size="sm" src={member.avatarUrl} />
                  <Link href={vaultsHref({ ...filters, playerId: member.id })}>{member.displayName}</Link>
                  <span className="player-group-count">
                    {playerCards.length} {playerCards.length === 1 ? 'vault' : 'vaults'}
                  </span>
                </h2>
                <CardList cards={playerCards} grouped now={now} />
              </section>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
