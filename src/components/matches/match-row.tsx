import { formatDuration, formatNumber, queueLabel, timeAgo } from '@/features/matches/format';
import { matchOutcome } from '@/features/matches/player-summary';
import type { PlayerMatchSummary } from '@/features/matches/types';

import { ChampionIcon } from './champion-icon';

/** Una partida del historial: resultado (texto + borde), campeón, cola, KDA, daño y CS. */
export function MatchRow({
  match,
  imageUrl,
  now,
}: {
  match: PlayerMatchSummary;
  imageUrl: string | undefined;
  now: Date;
}) {
  const outcome = matchOutcome(match);

  return (
    <li className="match-row" data-result={outcome.tone}>
      <ChampionIcon imageUrl={imageUrl} name={match.championName} />
      <div className="match-main">
        <p className="match-title">
          <span className="match-result">{outcome.label}</span> · {match.championName}
        </p>
        <p className="match-meta">
          {queueLabel(match.queue)} · {formatDuration(match.durationSeconds)} · {timeAgo(match.playedAt, now)}
        </p>
      </div>
      {/* A la derecha lo que importa: KDA y daño. El CS queda en la foto de la partida. */}
      <div className="match-numbers">
        <p className="match-kda">
          {match.kills}/{match.deaths}/{match.assists}
        </p>
        <p className="match-meta">{formatNumber(match.damageDealt)} daño</p>
      </div>
    </li>
  );
}
