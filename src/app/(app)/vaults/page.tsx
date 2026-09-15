import { LockKeyhole } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ConfirmActionButton } from '@/components/vaults/confirm-action-button';
import { getDb } from '@/db/client';
import { addDays, formatShortDate } from '@/features/vaults/vault-dates';
import type { VaultStatus } from '@/features/vaults/vault-rules';
import { requestLiftAction } from '@/features/vaults/vaults.actions';
import { listVaults, type VaultCard } from '@/features/vaults/vaults.queries';

export const dynamic = 'force-dynamic';

function statusLabel(card: VaultCard): string {
  const lastDay = formatShortDate(addDays(card.endsAt, -1));
  const labels: Partial<Record<VaultStatus, string>> = {
    scheduled: `Empieza ${formatShortDate(card.startsAt)} · hasta ${lastDay}`,
    active: `Vaulteado · hasta ${lastDay}`,
    served: `Cumplido · terminó ${lastDay}`,
    lifted: `Levantado${card.liftedAt ? ` · ${formatShortDate(card.liftedAt)}` : ''}`,
  };
  return labels[card.status] ?? '';
}

function VaultCardView({ card }: { card: VaultCard }) {
  const inForce = card.status === 'scheduled' || card.status === 'active';

  return (
    <article aria-labelledby={`vault-${card.id}`} className="proposal-card">
      <div className="proposal-head proposal-head-compact">
        <Image
          alt=""
          className="champion-avatar"
          height={44}
          src={card.champion.imageUrl}
          unoptimized
          width={44}
        />
        <div className="proposal-text">
          <h3 className="proposal-title" id={`vault-${card.id}`}>
            {card.target.name} — {card.champion.name}
          </h3>
          <p className="status-badge" data-tone={inForce ? 'vault' : 'neutral'}>
            {inForce ? <LockKeyhole aria-hidden="true" size={12} strokeWidth={2.5} /> : null}
            {statusLabel(card)}
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

export default async function VaultsPage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const { inForce, past } = listVaults(getDb(), new Date());

  return (
    <Screen title="Vaults">
      {inForce.length + past.length === 0 ? (
        <EmptyState
          description="Cuando una votación llegue a 3 votos a favor, el vault aparece acá."
          icon={LockKeyhole}
          title="Todos pueden jugar lo que quieran. Por ahora."
        />
      ) : null}

      {inForce.length > 0 ? (
        <section aria-labelledby="in-force-heading" className="grouped-section">
          <h2 id="in-force-heading">Vigentes</h2>
          <div className="proposal-list">
            {inForce.map((card) => (
              <VaultCardView card={card} key={card.id} />
            ))}
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="past-heading" className="grouped-section">
          <h2 id="past-heading">Terminados</h2>
          <div className="proposal-list">
            {past.map((card) => (
              <VaultCardView card={card} key={card.id} />
            ))}
          </div>
        </section>
      ) : null}
    </Screen>
  );
}
