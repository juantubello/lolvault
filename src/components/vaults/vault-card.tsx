import { LockKeyhole } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { UserAvatar } from '@/components/user-avatar';
import { addDays, formatShortDate } from '@/features/vaults/vault-dates';
import { daysLeft, isExpiringSoon } from '@/features/vaults/vault-filters';
import { isVaultInForce, type VaultStatus } from '@/features/vaults/vault-rules';
import { requestLiftAction } from '@/features/vaults/vaults.actions';
import type { VaultCard } from '@/features/vaults/vaults.queries';

import { ConfirmActionButton } from './confirm-action-button';

function statusLabel(card: VaultCard, now: Date): string {
  if (card.status === 'active') {
    const left = daysLeft(card, now);
    if (left <= 1) return 'Vaulteado · termina hoy';
    if (left === 2) return 'Vaulteado · termina mañana';
  }

  const lastDay = formatShortDate(addDays(card.endsAt, -1));
  const labels: Partial<Record<VaultStatus, string>> = {
    scheduled: `Empieza ${formatShortDate(card.startsAt)} · hasta ${lastDay}`,
    active: `Vaulteado · hasta ${lastDay}`,
    served: `Cumplido · terminó ${lastDay}`,
    lifted: `Levantado${card.liftedAt ? ` · ${formatShortDate(card.liftedAt)}` : ''}`,
  };
  return labels[card.status] ?? '';
}

export function VaultCardView({ card, now }: { card: VaultCard; now: Date }) {
  const inForce = isVaultInForce(card.status);
  const tone = !inForce ? 'neutral' : isExpiringSoon(card, now) ? 'warning' : 'vault';
  const titleId = `vault-${card.id}`;

  return (
    <article aria-labelledby={titleId} className="proposal-card">
      <div className="proposal-head proposal-head-compact">
        {/* Foto del campeón con la del jugador que lo tiene vaulteado encima. */}
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
            <UserAvatar name={card.target.name} size="sm" src={card.target.avatarUrl} />
          </span>
        </span>
        <div className="proposal-text">
          <h3 className="proposal-title" id={titleId}>
            {card.champion.name}
            <span className="proposal-title-player"> · {card.target.name}</span>
          </h3>
          <p className="status-badge" data-tone={tone}>
            {inForce ? <LockKeyhole aria-hidden="true" size={12} strokeWidth={2.5} /> : null}
            {statusLabel(card, now)}
          </p>
        </div>
      </div>

      {card.reason ? <p className="proposal-reason">“{card.reason}”</p> : null}

      {inForce ? (
        card.liftVoteOpen ? (
          <p className="vote-note">
            Hay una votación abierta para levantarlo. <Link href="/">Ir a votar</Link>
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
