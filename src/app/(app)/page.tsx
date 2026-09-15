import { Vote } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ProposalCardView } from '@/components/vaults/proposal-card';
import { ProposeVaultSheet } from '@/components/vaults/propose-vault-sheet';
import { VAULT_MAX_START_AHEAD_DAYS } from '@/config';
import { getDb } from '@/db/client';
import { listChampionOptions } from '@/features/champions/champions.queries';
import { ensureChampions } from '@/features/champions/ddragon-sync';
import { addDays, toLocalDateString } from '@/features/vaults/vault-dates';
import { listMembers, listVotingBoard, type ProposalCard } from '@/features/vaults/vaults.queries';

export const dynamic = 'force-dynamic';

function Section({ id, title, cards, now }: { id: string; title: string; cards: ProposalCard[]; now: Date }) {
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby={id} className="grouped-section">
      <h2 id={id}>{title}</h2>
      <div className="proposal-list">
        {cards.map((card) => (
          <ProposalCardView card={card} key={card.id} now={now} />
        ))}
      </div>
    </section>
  );
}

export default async function VotingPage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const db = getDb();
  const now = new Date();

  try {
    await ensureChampions(db);
  } catch (error) {
    // Sin campeones el sheet muestra el aviso; el resto de la pantalla sigue andando.
    console.error('[champions] No se pudieron cargar desde Data Dragon:', error);
  }

  const board = listVotingBoard(db, user.id, now);
  const isEmpty = board.pending.length + board.open.length + board.recent.length === 0;
  const today = toLocalDateString(now);

  return (
    <Screen
      action={
        <ProposeVaultSheet
          champions={listChampionOptions(db)}
          maxStartDate={toLocalDateString(addDays(now, VAULT_MAX_START_AHEAD_DAYS))}
          members={listMembers(db)}
          today={today}
          viewerId={user.id}
        />
      }
      title="Votaciones"
    >
      {isEmpty ? (
        <EmptyState
          description="Cuando alguien proponga un vault, vas a poder votarlo desde acá. Tocá “Proponer” para arrancar."
          icon={Vote}
          title="Nadie jugó tan mal todavía. Por ahora."
        />
      ) : null}
      <Section cards={board.pending} id="pending-heading" now={now} title="Te falta votar" />
      <Section cards={board.open} id="open-heading" now={now} title="En votación" />
      <Section cards={board.recent} id="recent-heading" now={now} title="Resueltas" />
    </Screen>
  );
}
