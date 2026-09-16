import { Ban, ChevronRight, Search, SearchX } from 'lucide-react';
import Link from 'next/link';

import { AddBlacklistSheet } from '@/components/blacklist/add-blacklist-sheet';
import { BlacklistEntryCardView } from '@/components/blacklist/blacklist-entry-card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { BLACKLIST_APPROVALS_REQUIRED } from '@/config';
import { getDb } from '@/db/client';
import type { User } from '@/db/schema';
import { normalizeBlacklistName } from '@/features/blacklist/blacklist-rules';
import { listBlacklist, type BlacklistEntryCard } from '@/features/blacklist/blacklist.queries';
import type { RouteSearchParams } from '@/features/punishments/routes';

import { PunishmentSegments } from './punishment-segments';

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function matchesQuery(card: BlacklistEntryCard, query: string): boolean {
  if (!query) return true;
  const searchable = [
    card.playerName,
    card.riotId?.gameName,
    card.riotId?.tagLine,
    card.riotId ? `${card.riotId.gameName}#${card.riotId.tagLine}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return normalizeBlacklistName(searchable).includes(normalizeBlacklistName(query));
}

function CardList({ cards }: { cards: BlacklistEntryCard[] }) {
  return <div className="proposal-list">{cards.map((card) => <BlacklistEntryCardView card={card} key={card.id} />)}</div>;
}

export function BlacklistSegment({
  searchParams,
  user,
}: {
  searchParams: RouteSearchParams;
  user: User & { displayName: string };
}) {
  const query = first(searchParams.q);
  const blacklist = listBlacklist(getDb(), new Date());
  const active = blacklist.active.filter((card) => matchesQuery(card, query));
  const history = blacklist.history.filter((card) => matchesQuery(card, query));
  const hasEntries = blacklist.active.length + blacklist.history.length > 0;

  return (
    <Screen action={<AddBlacklistSheet viewerId={user.id} />} title="Castigos">
      <PunishmentSegments selected="black-list" />

      {hasEntries ? (
        <div className="blacklist-filters">
          <form action="/castigos" className="blacklist-search" role="search">
            <input name="tipo" type="hidden" value="black-list" />
            <Search aria-hidden="true" size={18} strokeWidth={2} />
            <input
              aria-label="Buscar por nombre o Riot ID"
              autoComplete="off"
              defaultValue={query}
              enterKeyHint="search"
              name="q"
              placeholder="Buscar nombre o Riot ID"
              type="search"
            />
            <button className="sr-only" type="submit">Buscar</button>
          </form>
          {query ? <Link className="clear-filters" href="/castigos?tipo=black-list">Limpiar búsqueda</Link> : null}
        </div>
      ) : null}

      {!hasEntries ? (
        <EmptyState
          description={`Cuando una propuesta alcance ${BLACKLIST_APPROVALS_REQUIRED} votos a favor, el jugador aparece acá.`}
          icon={Ban}
          title="La black list está vacía. Por ahora."
        />
      ) : active.length > 0 ? (
        <section aria-labelledby="blacklist-active-heading" className="grouped-section">
          <h2 id="blacklist-active-heading">Vigentes</h2>
          <CardList cards={active} />
        </section>
      ) : (
        <EmptyState
          description="Probá con otro nombre o limpiá la búsqueda."
          icon={SearchX}
          title={`No hay jugadores que coincidan con “${query}”`}
        />
      )}

      {history.length > 0 ? (
        <details className="blacklist-history" open={Boolean(query)}>
          <summary>
            <span className="blacklist-history-title">
              <ChevronRight aria-hidden="true" size={18} strokeWidth={2} />
              Historial
            </span>
            <span>{history.length}</span>
          </summary>
          <section aria-label="Jugadores sacados de la black list"><CardList cards={history} /></section>
        </details>
      ) : null}
    </Screen>
  );
}
