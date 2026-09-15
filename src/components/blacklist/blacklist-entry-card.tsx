import { Ban, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { BLACKLIST_APPROVALS_REQUIRED } from '@/config';
import { formatDateTime, formatDuration, queueLabel } from '@/features/matches/format';
import { requestBlacklistRemovalAction } from '@/features/blacklist/blacklist.actions';
import type { BlacklistEntryCard } from '@/features/blacklist/blacklist.queries';

import { ConfirmActionButton } from '../vaults/confirm-action-button';

export function BlacklistEntryCardView({ card }: { card: BlacklistEntryCard }) {
  const titleId = `blacklist-entry-${card.id}`;
  return (
    <article aria-labelledby={titleId} className="proposal-card blacklist-card">
      <div className="proposal-head proposal-head-compact">
        <span aria-hidden="true" className="blacklist-icon">
          <Ban size={22} strokeWidth={2} />
        </span>
        <div className="proposal-text">
          <h3 className="proposal-title" id={titleId}>{card.playerName}</h3>
          {card.riotId ? (
            <p className="proposal-meta">{card.riotId.gameName}#{card.riotId.tagLine}</p>
          ) : null}
        </div>
      </div>

      {card.reason ? <p className="proposal-reason">“{card.reason}”</p> : null}
      <p className="blacklist-byline">
        Agregó {card.proposer.name} · {formatDateTime(card.addedAt)}
        {card.removedAt ? ` · se sacó ${formatDateTime(card.removedAt)}` : ''}
      </p>

      {card.match ? (
        card.match.memberId ? (
          <Link
            className="match-attachment"
            href={`/partidas/${encodeURIComponent(card.match.matchId)}?jugador=${card.match.memberId}&desde=black-list`}
          >
            <span>
              <span className="match-attachment-label">Partida adjunta</span>
              <span className="match-attachment-summary">
                {card.match.target
                  ? `${card.match.target.championName} · ${card.match.target.kills}/${card.match.target.deaths}/${card.match.target.assists} · `
                  : ''}
                {queueLabel(card.match.queue)} · {formatDuration(card.match.durationSeconds)} · {formatDateTime(card.match.playedAt)}
              </span>
            </span>
            <ChevronRight aria-hidden="true" size={18} strokeWidth={2} />
          </Link>
        ) : (
          <div className="match-attachment" role="note">
            <span>
              <span className="match-attachment-label">Partida adjunta</span>
              <span className="match-attachment-summary">{formatDateTime(card.match.playedAt)}</span>
            </span>
          </div>
        )
      ) : null}

      {card.status === 'active' ? (
        card.removeProposalOpen ? (
          <p className="vote-note">Ya hay una votación abierta para sacar a este jugador.</p>
        ) : (
          <ConfirmActionButton
            action={requestBlacklistRemovalAction}
            confirmMessage={`¿Pedir una votación para sacar a este jugador de la black list? Necesita ${BLACKLIST_APPROVALS_REQUIRED} votos a favor.`}
            fields={{ entryId: card.id }}
            label="Pedir que se saque"
            pendingLabel="Pidiendo…"
          />
        )
      ) : null}
    </article>
  );
}
