import { LockKeyhole } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

export default function VaultsPage() {
  return (
    <Screen title="Vaults">
      <EmptyState
        description="Los campeones bloqueados y su tiempo restante van a aparecer en esta lista."
        icon={LockKeyhole}
        title="No hay campeones en el vault. Que dure la buena racha."
      />
    </Screen>
  );
}
