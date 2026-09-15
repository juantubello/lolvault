/** Reglas puras de la black list. Ningún estado depende de jobs ni de flags calculados. */
import { BLACKLIST_APPROVALS_REQUIRED, VOTING_WINDOW_MS } from '@/config';
import { parseRiotId, RIOT_ID_ERROR } from '@/features/profile/profile-form';
import type { RiotId } from '@/features/matches/types';

export type BlacklistVotingTimeline = {
  closesAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
};

export type BlacklistVotingStatus =
  | 'open'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export function blacklistVotingStatus(
  voting: BlacklistVotingTimeline,
  now: Date,
): BlacklistVotingStatus {
  if (voting.cancelledAt) return 'cancelled';
  if (voting.rejectedAt) return 'rejected';
  if (voting.approvedAt) return 'approved';
  return now < voting.closesAt ? 'open' : 'expired';
}

export function blacklistClosesAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + VOTING_WINDOW_MS);
}

export type BlacklistVoteTally = {
  yes: number;
  no: number;
  /** Todos los miembros con perfil completo pueden votar; no hay acusado. */
  eligibleVoters: number;
};

export function blacklistVoteOutcome({
  yes,
  no,
  eligibleVoters,
}: BlacklistVoteTally): 'approved' | 'rejected' | 'open' {
  if (yes >= BLACKLIST_APPROVALS_REQUIRED) return 'approved';
  const pending = Math.max(eligibleVoters - yes - no, 0);
  return yes + pending < BLACKLIST_APPROVALS_REQUIRED ? 'rejected' : 'open';
}

export function isBlacklistEntryActive(entry: {
  kind: 'add' | 'remove';
  approvedAt: Date | null;
  removedAt: Date | null;
}): boolean {
  return entry.kind === 'add' && entry.approvedAt !== null && entry.removedAt === null;
}

/** Minúsculas, sin tildes, espacios internos colapsados. */
export function normalizeBlacklistName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/g, ' ');
}

export function riotIdKey(riotId: RiotId): string {
  return `${riotId.gameName}#${riotId.tagLine}`.toLocaleLowerCase('en-US');
}

export function dedupeKey(name: string, riotId: RiotId | null): string {
  return riotId ? `riot:${riotIdKey(riotId)}` : `name:${normalizeBlacklistName(name)}`;
}

/** Parser compartido con Perfil; vacío significa Riot ID opcional no informado. */
export function validateBlacklistRiotId(
  value: string,
): { ok: true; riotId: RiotId | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, riotId: null };
  const riotId = parseRiotId(trimmed);
  return riotId ? { ok: true, riotId } : { ok: false, error: RIOT_ID_ERROR };
}
