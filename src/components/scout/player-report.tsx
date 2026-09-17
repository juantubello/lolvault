import { Ban } from 'lucide-react';

import { AddBlacklistSheet } from '@/components/blacklist/add-blacklist-sheet';
import { PlayerPerformanceReport } from '@/components/matches/player-performance-report';
import type { ActiveBlacklistPlayer } from '@/features/blacklist/blacklist.queries';
import type { PlayerStats } from '@/features/matches/player-stats';
import type { ScoutPlayer } from '@/features/scout/player';

type LoadedStats = Extract<PlayerStats, { status: 'ok' }>;

export function ScoutPlayerReport({
  activeBlacklist,
  championImages,
  now,
  player,
  stats,
  viewerId,
}: {
  activeBlacklist: ActiveBlacklistPlayer | null;
  championImages: Map<number, string>;
  now: Date;
  player: ScoutPlayer;
  stats: LoadedStats;
  viewerId: number;
}) {
  const profile = stats.profile;
  const riotId = profile
    ? { gameName: profile.gameName, tagLine: profile.tagLine }
    : stats.riotId;
  const riotIdText = `${riotId.gameName}#${riotId.tagLine}`;

  return (
    <div className="scout-report">
      <section aria-labelledby="scout-player-heading" className="scout-player-card">
        <div className="scout-player-copy">
          <p className="scout-eyebrow">Riot ID · {player.region}</p>
          <h2 id="scout-player-heading">{riotIdText}</h2>
          <p>
            {profile?.level ? `Nivel ${profile.level}` : 'Nivel no disponible'}
            {profile?.ladder ? ` · Puesto ${profile.ladder.rank.toLocaleString('es-AR')}` : ''}
          </p>
        </div>
        {activeBlacklist ? (
          <div className="scout-blacklist-badge" role="status">
            <Ban aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Está en la black list</strong>
              {activeBlacklist.reason ? <small>{activeBlacklist.reason}</small> : null}
            </span>
          </div>
        ) : null}
      </section>

      {!activeBlacklist ? (
        <div className="scout-actions">
          <AddBlacklistSheet
            initialPlayerName={riotId.gameName}
            initialRiotId={riotIdText}
            key={riotIdText}
            triggerLabel="Proponer para la black list"
            viewerId={viewerId}
          />
        </div>
      ) : null}

      <PlayerPerformanceReport
        analysisMode="opponent"
        championImages={championImages}
        matchSource="scout"
        now={now}
        stats={stats}
        userId={player.id}
      />
    </div>
  );
}
