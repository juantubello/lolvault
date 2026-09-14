import { Users } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

export default function FriendsPage() {
  return (
    <Screen title="Amigos">
      <EmptyState
        description="Los perfiles aparecen solos a medida que cada persona entra por primera vez."
        icon={Users}
        title="Todavía no hay amigos para mostrar."
      />
    </Screen>
  );
}
