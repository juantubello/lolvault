/** Textos y tono del estado de un vault. Los usan la tarjeta de Vaults y las etiquetas del perfil. */
import { addDays, formatShortDate } from './vault-dates';
import { daysLeft, isExpiringSoon } from './vault-filters';
import { isVaultInForce, type VaultStatus } from './vault-rules';

type VaultLabelInput = {
  status: VaultStatus;
  startsAt: Date;
  endsAt: Date;
  liftedAt: Date | null;
};

export function vaultStatusLabel(vault: VaultLabelInput, now: Date): string {
  if (vault.status === 'active') {
    const left = daysLeft(vault, now);
    if (left <= 1) return 'Vaulteado · termina hoy';
    if (left === 2) return 'Vaulteado · termina mañana';
  }

  const lastDay = formatShortDate(addDays(vault.endsAt, -1));
  switch (vault.status) {
    case 'scheduled':
      return `Empieza ${formatShortDate(vault.startsAt)} · hasta ${lastDay}`;
    case 'active':
      return `Vaulteado · hasta ${lastDay}`;
    case 'served':
      return `Cumplido · terminó ${lastDay}`;
    case 'lifted':
      return `Levantado${vault.liftedAt ? ` · ${formatShortDate(vault.liftedAt)}` : ''}`;
    default:
      return '';
  }
}

/** Vigente = dorado; por expirar = naranja; terminado = neutro. */
export function vaultTone(vault: Pick<VaultLabelInput, 'status' | 'endsAt'>, now: Date): 'vault' | 'warning' | 'neutral' {
  if (!isVaultInForce(vault.status)) return 'neutral';
  return isExpiringSoon(vault, now) ? 'warning' : 'vault';
}
