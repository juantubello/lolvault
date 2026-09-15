import { Ban, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import {
  blacklistVoteAction,
  cancelBlacklistProposalAction,
} from '@/features/blacklist/blacklist.actions';
import type { BlacklistProposalCard } from '@/features/blacklist/blacklist.queries';
import type { BlacklistVotingStatus } from '@/features/blacklist/blacklist-rules';
import { formatDateTime, formatDuration, queueLabel } from '@/features/matches/format';
import { formatTimeLeft } from '@/features/vaults/vault-dates';

import { ConfirmActionButton } from '../vaults/confirm-action-button';
import { VoteButtons } from '../vaults/vote-buttons';

const URGENT_MS = 6 * 60 * 60 * 1000;

const STATUS: Record<BlacklistVotingStatus, { label: string; tone: 'neutral' | 'danger' | 'vault' }> = {
  open: { label: 'En votación', tone: 'neutral' },
  approved: { label: 'Aprobado', tone: 'vault' },
  rejected: { label: 'Rechazado', tone: 'danger' },
  expired: { label: 'Venció', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export function BlacklistProposalCardView({
  card,
  now,
}: {
  card: BlacklistProposalCard;
  now: Date;
}) {
  const isRemoval = card.kind === 'remove';
  const status = card.status === 'approved'
    ? { label: isRemoval ? 'Sacado' : 'Agregado', tone: 'vault' as const }
    : STATUS[card.status];
  const titleId = `blacklist-proposal-${card.id}`;

  return (
    <article aria-labelledby={titleId} className="proposal-card blacklist-card">
      <div className="proposal-head">
        <span aria-hidden="true" className="blacklist-icon">
          <Ban size={22} strokeWidth={2} />
        </span>
        <div className="proposal-text">
          <h3 className="proposal-title" id={titleId}>
            {isRemoval ? 'Sacar de la black list' : 'Black list'} · {card.playerName}
          </h3>
          {card.riotId ? (
            <p className="proposal-meta">{card.riotId.gameName}#{card.riotId.tagLine}</p>
          ) : null}
        </div>
        {card.status === 'open' ? (
          <p className="vote-progress">
            <span className="vote-count">{card.yes}/{card.required}</span>
            <span aria-hidden="true" className="vote-dots">
              {Array.from({ length: card.required }, (_, index) => (
                <span className="vote-dot" data-filled={index < card.yes} key={index} />
              ))}
            </span>
            <span className="sr-only"> votos a favor</span>
          </p>
        ) : (
          <span className="status-badge" data-tone={status.tone}>{status.label}</span>
        )}
      </div>

      {card.reason ? <p className="proposal-reason">“{card.reason}”</p> : null}

      {card.match ? (
        card.match.memberId ? (
          <Link
            className="match-attachment"
            href={`/partidas/${encodeURIComponent(card.match.matchId)}?jugador=${card.match.memberId}&desde=votaciones`}
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
        ) : null
      ) : null}

      {card.status === 'open' ? (
        <>
          {card.canVote ? (
            <VoteButtons action={blacklistVoteAction} myVote={card.myVote} proposalId={card.id} />
          ) : null}
          <footer className="proposal-card-footer">
            <p className="time-left" data-urgent={card.closesAt.getTime() - now.getTime() < URGENT_MS}>
              Cierra en {formatTimeLeft(card.closesAt, now)} · {isRemoval ? 'pidió' : 'propuso'} {card.proposer.name}
            </p>
            {card.canCancel ? (
              <ConfirmActionButton
                action={cancelBlacklistProposalAction}
                confirmMessage="¿Cancelar esta votación? No se puede deshacer."
                fields={{ proposalId: card.id }}
                label="Cancelar votación"
                pendingLabel="Cancelando…"
                tone="danger"
              />
            ) : null}
          </footer>
        </>
      ) : null}
    </article>
  );
}
