import { LockKeyhole } from 'lucide-react';

import { formatShortDate } from '@/features/vaults/vault-dates';
import { vaultStatusLabel, vaultTone } from '@/features/vaults/vault-labels';
import type { ChampionVault } from '@/features/vaults/vaults.queries';

/** Etiqueta "Vaulteado" junto a un campeón que el jugador tiene bloqueado. Nada si no hay vault. */
export function ChampionVaultBadge({ vault, now }: { vault: ChampionVault | undefined; now: Date }) {
  if (!vault) return null;

  const label =
    vault.status === 'scheduled'
      ? `Vault desde ${formatShortDate(vault.startsAt)}`
      : vaultStatusLabel({ ...vault, liftedAt: null }, now);

  return (
    <span className="status-badge champion-vault-badge" data-tone={vaultTone(vault, now)}>
      <LockKeyhole aria-hidden="true" size={12} strokeWidth={2.5} />
      {label}
    </span>
  );
}
