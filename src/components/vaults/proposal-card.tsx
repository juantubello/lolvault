import Image from 'next/image';

import { MatchSnapshot } from '@/components/matches/match-snapshot';
import { formatDateRange, formatTimeLeft } from '@/features/vaults/vault-dates';
import type { VotingStatus } from '@/features/vaults/vault-rules';
import { cancelProposalAction } from '@/features/vaults/vaults.actions';
import type { ProposalCard } from '@/features/vaults/vaults.queries';

import { ConfirmActionButton } from './confirm-action-button';
import { VoteButtons } from './vote-buttons';

const URGENT_MS = 6 * 60 * 60 * 1000;

const STATUS: Record<VotingStatus, { label: string; tone: 'neutral' | 'vault' | 'danger' }> = {
  open: { label: 'En votación', tone: 'neutral' },
  approved: { label: 'Aprobado', tone: 'vault' },
  rejected: { label: 'Rechazado', tone: 'danger' },
  expired: { label: 'Venció', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export function ProposalCardView({
  card,
  now,
  championImages,
}: {
  card: ProposalCard;
  now: Date;
  championImages: Map<number, string>;
}) {
  const isLift = card.kind === 'lift';
  const matchTarget = card.match?.teams.flatMap((team) => team.participants).find((participant) => participant.isTarget);
  const dates = card.startsAt && card.endsAt ? formatDateRange(card.startsAt, card.endsAt) : null;
  const status =
    isLift && card.status === 'approved' ? { label: 'Levantado', tone: 'vault' as const } : STATUS[card.status];
  const titleId = `proposal-${card.id}`;

  return (
    <article aria-labelledby={titleId} className="proposal-card">
      <div className="proposal-head">
        <Image
          alt=""
          className="champion-avatar"
          height={44}
          src={card.champion.imageUrl}
          unoptimized
          width={44}
        />
        <div className="proposal-text">
          <h3 className="proposal-title" id={titleId}>
            {isLift ? 'Levantar vault · ' : ''}
            {card.target.name} — {card.champion.name}
          </h3>
          <p className="proposal-meta">
            {dates ? `${dates} · ` : ''}
            {isLift ? 'pidió' : 'propuso'} {card.proposer.name}
          </p>
        </div>
        {card.status === 'open' ? (
          <p className="vote-progress">
            <span className="vote-count">
              {card.yes}/{card.required}
            </span>
            <span aria-hidden="true" className="vote-dots">
              {Array.from({ length: card.required }, (_, index) => (
                <span className="vote-dot" data-filled={index < card.yes} key={index} />
              ))}
            </span>
            <span className="sr-only"> votos a favor</span>
          </p>
        ) : (
          <span className="status-badge" data-tone={status.tone}>
            {status.label}
          </span>
        )}
      </div>

      {card.reason ? <p className="proposal-reason">“{card.reason}”</p> : null}

      {card.match ? (
        <details className="match-attachment">
          <summary>
            <span className="match-attachment-label">Partida adjunta</span>
            {matchTarget ? (
              <span className="match-attachment-summary">
                {matchTarget.championName} · {matchTarget.kills}/{matchTarget.deaths}/{matchTarget.assists} ·{' '}
                {matchTarget.result === 'WIN' ? 'Victoria' : 'Derrota'}
              </span>
            ) : null}
          </summary>
          <MatchSnapshot championImages={championImages} detail={card.match} />
        </details>
      ) : null}

      {card.status === 'open' ? (
        <>
          <p className="time-left" data-urgent={card.closesAt.getTime() - now.getTime() < URGENT_MS}>
            Cierra en {formatTimeLeft(card.closesAt, now)}
            {card.no ? ` · ${card.no} en contra` : ''}
          </p>
          {card.canVote ? (
            <VoteButtons myVote={card.myVote} proposalId={card.id} />
          ) : (
            <p className="vote-note">Es para vos: no podés votarlo.</p>
          )}
          {card.canCancel ? (
            <ConfirmActionButton
              action={cancelProposalAction}
              confirmMessage="¿Cancelar esta votación? No se puede deshacer."
              fields={{ proposalId: card.id }}
              label="Cancelar votación"
              pendingLabel="Cancelando…"
              tone="danger"
            />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
