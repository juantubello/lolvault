import { LockKeyhole } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { UserAvatar } from '@/components/user-avatar';
import { vaultStatusLabel, vaultTone } from '@/features/vaults/vault-labels';
import { isVaultInForce } from '@/features/vaults/vault-rules';
import { requestLiftAction } from '@/features/vaults/vaults.actions';
import type { VaultCard } from '@/features/vaults/vaults.queries';

import { ConfirmActionButton } from './confirm-action-button';

export function VaultCardView({ card, grouped = false, now }: { card: VaultCard; grouped?: boolean; now: Date }) {
  const inForce = isVaultInForce(card.status);
  const tone = vaultTone(card, now);
  const titleId = `vault-${card.id}`;

  return (
    <article aria-labelledby={titleId} className="proposal-card">
      <div className="proposal-head proposal-head-compact">
        {grouped ? (
          <Image
            alt=""
            className="champion-avatar"
            height={44}
            src={card.champion.imageUrl}
            unoptimized
            width={44}
          />
        ) : (
          <span className="champion-with-player">
            <Image
              alt=""
              className="champion-avatar"
              height={44}
              src={card.champion.imageUrl}
              unoptimized
              width={44}
            />
            <span className="player-badge">
              <UserAvatar id={card.target.id} name={card.target.name} size="sm" src={card.target.avatarUrl} />
            </span>
          </span>
        )}
        <div className="proposal-text">
          <h3 className="proposal-title" id={titleId}>
            {card.champion.name}
            {grouped ? null : <span className="proposal-title-player"> · {card.target.name}</span>}
          </h3>
          <p className="status-badge" data-tone={tone}>
            {inForce ? <LockKeyhole aria-hidden="true" size={12} strokeWidth={2.5} /> : null}
            {vaultStatusLabel(card, now)}
          </p>
        </div>
      </div>

      {card.reason ? <p className="proposal-reason">“{card.reason}”</p> : null}

      {inForce ? (
        card.liftVoteOpen ? (
          <p className="vote-note vote-note-with-action">
            <span>Hay una votación abierta para levantarlo.</span>
            <Link className="inline-action-link" href="/">
              Ir a votar
            </Link>
          </p>
        ) : (
          <ConfirmActionButton
            action={requestLiftAction}
            confirmMessage="¿Pedir una votación para levantar este vault? Necesita 3 votos a favor."
            fields={{ vaultId: card.id }}
            label="Pedir que se levante"
            pendingLabel="Pidiendo…"
          />
        )
      ) : null}
    </article>
  );
}
