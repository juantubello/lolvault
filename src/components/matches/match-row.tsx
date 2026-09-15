import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { formatDuration, formatNumber, queueLabel, timeAgo } from '@/features/matches/format';
import { matchOutcome } from '@/features/matches/player-summary';
import type { PlayerMatchSummary } from '@/features/matches/types';

import { ChampionIcon } from './champion-icon';

/** Una partida del historial: resultado (texto + borde), campeón, cola, KDA, daño y CS. */
export function MatchRow({
  match,
  imageUrl,
  now,
  userId,
}: {
  match: PlayerMatchSummary;
  imageUrl: string | undefined;
  now: Date;
  userId: number;
}) {
  const outcome = matchOutcome(match);

  return (
    <li data-result={outcome.tone}>
      <Link
        className="match-row"
        href={`/partidas/${encodeURIComponent(match.matchId)}?jugador=${userId}`}
      >
        <ChampionIcon imageUrl={imageUrl} name={match.championName} />
        <div className="match-main">
          <p className="match-title">
            <span className="match-result">{outcome.label}</span> · {match.championName}
          </p>
          <p className="match-meta">
            {queueLabel(match.queue)} · {formatDuration(match.durationSeconds)} · {timeAgo(match.playedAt, now)}
          </p>
        </div>
        <div className="match-numbers">
          <p className="match-kda">
            {match.kills}/{match.deaths}/{match.assists}
          </p>
          <p className="match-meta">{formatNumber(match.damageDealt)} daño</p>
        </div>
        <ChevronRight aria-hidden="true" className="match-row-chevron" size={18} strokeWidth={2} />
      </Link>
    </li>
  );
}
