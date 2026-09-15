/**
 * Reglas del vault como funciones puras (sin DB ni reloj): el estado se deriva de timestamps,
 * nunca de un cron ni de un flag `is_active`. Ver PLAN-TECNICO §3.
 *
 * Hay dos tipos de votación con las mismas reglas: vaultear un campeón ('vault') y levantar
 * antes de tiempo un vault aprobado ('lift').
 */
import { VAULT_APPROVALS_REQUIRED, VOTING_WINDOW_MS } from '@/config';

export type VotingTimeline = {
  closesAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
};

export type VotingStatus =
  | 'open' // votación abierta
  | 'expired' // pasaron las 48 h sin llegar a 3 votos
  | 'rejected' // ya no puede llegar a 3 votos a favor
  | 'cancelled'
  | 'approved';

export function votingStatus(voting: VotingTimeline, now: Date): VotingStatus {
  if (voting.cancelledAt) return 'cancelled';
  if (voting.rejectedAt) return 'rejected';
  if (voting.approvedAt) return 'approved';
  return now < voting.closesAt ? 'open' : 'expired';
}

export type VaultTimeline = VotingTimeline & {
  startsAt: Date;
  endsAt: Date;
  liftedAt: Date | null;
};

export type VaultStatus =
  | Exclude<VotingStatus, 'approved'>
  | 'scheduled' // aprobado, todavía no empezó
  | 'active' // vigente
  | 'served' // cumplido
  | 'lifted'; // levantado antes de tiempo por votación

/** Un vault aprobado arranca en "desde", o al aprobarse si eso pasó después. */
export function vaultStartsAt(vault: Pick<VaultTimeline, 'startsAt' | 'approvedAt'>): Date {
  const { startsAt, approvedAt } = vault;
  return approvedAt && approvedAt > startsAt ? approvedAt : startsAt;
}

export function vaultStatus(vault: VaultTimeline, now: Date): VaultStatus {
  const voting = votingStatus(vault, now);
  if (voting !== 'approved') return voting;

  if (vault.liftedAt) return 'lifted';
  if (now < vaultStartsAt(vault)) return 'scheduled';
  return now < vault.endsAt ? 'active' : 'served';
}

/** Solo un vault vigente (programado o activo) se puede pedir levantar. */
export function isVaultInForce(status: VaultStatus): boolean {
  return status === 'scheduled' || status === 'active';
}

/** La votación cierra a las 48 h, o antes si el vault ya habría terminado. */
export function closesAtFor(createdAt: Date, vaultEndsAt: Date): Date {
  return new Date(Math.min(createdAt.getTime() + VOTING_WINDOW_MS, vaultEndsAt.getTime()));
}

export type VoteTally = {
  yes: number;
  no: number;
  /** Miembros que pueden votar esta propuesta (todos menos el jugador vaulteado). */
  eligibleVoters: number;
};

/** Resultado después de un voto. Rechazada = ni con todos los que faltan llega a 3. */
export function voteOutcome({ yes, no, eligibleVoters }: VoteTally): 'approved' | 'rejected' | 'open' {
  if (yes >= VAULT_APPROVALS_REQUIRED) return 'approved';

  const pending = Math.max(eligibleVoters - yes - no, 0);
  return yes + pending < VAULT_APPROVALS_REQUIRED ? 'rejected' : 'open';
}
