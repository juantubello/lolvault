/** Partidas resumidas para elegir la decisiva en "Proponer vault". Serializable (va al cliente). */
import { formatDuration, queueLabel, timeAgo } from './format';
import { matchOutcome } from './player-summary';
import type { PlayerMatchSummary } from './types';

export const PROPOSAL_MATCH_OPTIONS = 10;

export type MatchOption = {
  matchId: string;
  championName: string;
  imageUrl: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  resultLabel: string;
  resultTone: 'win' | 'loss' | 'neutral';
  /** "Flex · 37:00 · hace 5 h" */
  meta: string;
};

export function toMatchOptions(
  matches: PlayerMatchSummary[],
  championImages: Map<number, string>,
  now: Date,
  limit = PROPOSAL_MATCH_OPTIONS,
): MatchOption[] {
  return matches.slice(0, limit).map((match) => {
    const outcome = matchOutcome(match);
    return {
      matchId: match.matchId,
      championName: match.championName,
      imageUrl: championImages.get(match.championId) ?? null,
      kills: match.kills,
      deaths: match.deaths,
      assists: match.assists,
      damageDealt: match.damageDealt,
      resultLabel: outcome.label,
      resultTone: outcome.tone,
      meta: `${queueLabel(match.queue)} · ${formatDuration(match.durationSeconds)} · ${timeAgo(match.playedAt, now)}`,
    };
  });
}
