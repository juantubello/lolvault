import { timeAgo } from '@/features/matches/format';

import type { KnownPlayerMember, KnownPlayerSuggestion } from './known-players';

const listFormat = new Intl.ListFormat('es-AR', { style: 'long', type: 'conjunction' });

export function formatKnownPlayerMembers(
  members: readonly KnownPlayerMember[],
  viewerId: number,
): string {
  const labels = members
    .filter((member) => member.id !== viewerId)
    .map((member) => member.displayName);
  if (members.some((member) => member.id === viewerId)) labels.push('vos');
  return labels.length > 0 ? listFormat.format(labels) : 'el grupo';
}

export function formatKnownPlayerSuggestion(
  suggestion: Pick<KnownPlayerSuggestion, 'sharedMatches' | 'lastPlayedAt' | 'members'>,
  viewerId: number,
  now: Date,
): string {
  const matches = suggestion.sharedMatches === 1 ? '1 partida' : `${suggestion.sharedMatches} partidas`;
  return `${matches} con ${formatKnownPlayerMembers(suggestion.members, viewerId)} · ${timeAgo(
    new Date(suggestion.lastPlayedAt),
    now,
  )}`;
}

export function formatKnownPlayerMatch(
  members: readonly KnownPlayerMember[],
  viewerId: number,
  playedAt: Date,
  now: Date,
): string {
  return `con ${formatKnownPlayerMembers(members, viewerId)} · ${timeAgo(new Date(playedAt), now)}`;
}

export type VotingCardWithDate = { createdAt: Date };

export type MergedVotingCard<Vault extends VotingCardWithDate, Blacklist extends VotingCardWithDate> =
  | { type: 'vault'; card: Vault }
  | { type: 'blacklist'; card: Blacklist };

/** Mezcla ambos tableros sin duplicar la clasificación que ya hicieron sus queries. */
export function mergeVotingCards<
  Vault extends VotingCardWithDate,
  Blacklist extends VotingCardWithDate,
>(
  vaults: readonly Vault[],
  blacklist: readonly Blacklist[],
  order: 'oldest' | 'newest',
): MergedVotingCard<Vault, Blacklist>[] {
  const direction = order === 'oldest' ? 1 : -1;
  return [
    ...vaults.map((card) => ({ type: 'vault' as const, card })),
    ...blacklist.map((card) => ({ type: 'blacklist' as const, card })),
  ].sort(
    (left, right) =>
      direction * (left.card.createdAt.getTime() - right.card.createdAt.getTime()),
  );
}
