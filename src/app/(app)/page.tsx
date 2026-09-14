import { Vote } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

export default function VotingPage() {
  return (
    <Screen title="Votaciones">
      <EmptyState
        description="Cuando alguien proponga un vault, vas a poder seguir la votación desde acá."
        icon={Vote}
        title="Nadie jugó tan mal todavía. Por ahora."
      />
    </Screen>
  );
}
