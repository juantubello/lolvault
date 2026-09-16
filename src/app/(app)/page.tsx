import { Vote } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { BlacklistProposalCardView } from '@/components/blacklist/blacklist-proposal-card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ProposalCardView } from '@/components/vaults/proposal-card';
import { getDb } from '@/db/client';
import { mergeVotingCards, type MergedVotingCard } from '@/features/blacklist/blacklist-ui';
import {
  listBlacklistVotingBoard,
  type BlacklistProposalCard,
} from '@/features/blacklist/blacklist.queries';
import { listVotingBoard, type ProposalCard } from '@/features/vaults/vaults.queries';

export const dynamic = 'force-dynamic';

function Section({
  id,
  title,
  cards,
  now,
}: {
  id: string;
  title: string;
  cards: MergedVotingCard<ProposalCard, BlacklistProposalCard>[];
  now: Date;
}) {
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby={id} className="grouped-section">
      <h2 id={id}>{title}</h2>
      <div className="proposal-list">
        {cards.map((item) => item.type === 'vault'
          ? <ProposalCardView card={item.card} key={`vault-${item.card.id}`} now={now} />
          : <BlacklistProposalCardView card={item.card} key={`blacklist-${item.card.id}`} now={now} />)}
      </div>
    </section>
  );
}

export default async function VotingPage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const db = getDb();
  const now = new Date();

  const board = listVotingBoard(db, user.id, now);
  const blacklistBoard = listBlacklistVotingBoard(db, user.id, now);
  const pending = mergeVotingCards(board.pending, blacklistBoard.pending, 'oldest');
  const open = mergeVotingCards(board.open, blacklistBoard.open, 'newest');
  const recent = mergeVotingCards(board.recent, blacklistBoard.recent, 'newest');
  const isEmpty = pending.length + open.length + recent.length === 0;

  return (
    <Screen title="Votaciones">
      {isEmpty ? (
        <EmptyState
          description="Cuando alguien proponga un vault o un cambio en la black list, vas a poder votarlo desde acá."
          icon={Vote}
          title="Nadie jugó tan mal todavía. Por ahora."
        />
      ) : null}
      <Section cards={pending} id="pending-heading" now={now} title="Te falta votar" />
      <Section cards={open} id="open-heading" now={now} title="En votación" />
      <Section cards={recent} id="recent-heading" now={now} title="Resueltas" />
    </Screen>
  );
}
