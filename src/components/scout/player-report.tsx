import { Ban, ShieldAlert } from 'lucide-react';

import { AddBlacklistSheet } from '@/components/blacklist/add-blacklist-sheet';
import { ChampionIcon } from '@/components/matches/champion-icon';
import { MatchRow } from '@/components/matches/match-row';
import type { ActiveBlacklistPlayer } from '@/features/blacklist/blacklist.queries';
import {
  formatKda,
  formatPercent,
  POSITIONS,
  positionLabel,
  queueLabel,
  rankLabel,
  timeAgo,
} from '@/features/matches/format';
import type { PlayerStats } from '@/features/matches/player-stats';
import {
  kdaRatio,
  summarizeMatchesByChampion,
  summarizeMatchesByPosition,
} from '@/features/matches/player-summary';
import type { ScoutPlayer } from '@/features/scout/player';

type LoadedStats = Extract<PlayerStats, { status: 'ok' }>;

function recordLabel(games: number, wins: number): string {
  return `${games} ${games === 1 ? 'partida' : 'partidas'} · ${wins} V ${games - wins} D`;
}

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
  const positions = new Map(
    summarizeMatchesByPosition(stats.matches).map((position) => [position.position, position]),
  );
  const recentChampions = summarizeMatchesByChampion(stats.matches);

  return (
    <div className="scout-report">
      <section aria-labelledby="scout-player-heading" className="scout-player-card">
        <div className="scout-player-copy">
          <p className="scout-eyebrow">Riot ID · {player.region}</p>
          <h2 id="scout-player-heading">{riotIdText}</h2>
          <p>{profile?.level ? `Nivel ${profile.level}` : 'Nivel no disponible'}</p>
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

      {stats.error ? (
        <p className="stats-banner" role="status">
          <ShieldAlert aria-hidden="true" size={18} strokeWidth={2} />
          <span>{stats.error}</span>
        </p>
      ) : null}

      <section aria-labelledby="scout-ranks-heading" className="scout-section">
        <h2 id="scout-ranks-heading">Rango por cola</h2>
        {profile?.ranks.length ? (
          <div className="stat-tiles">
            {profile.ranks.map((rank) => {
              const games = rank.wins + rank.losses;
              return (
                <div className="stat-tile" key={rank.queue}>
                  <p className="stat-label">{queueLabel(rank.queue)}</p>
                  <p className="stat-value stat-value-rank">{rankLabel(rank) ?? 'Sin rango'}</p>
                  <p className="stat-detail">
                    {rank.lp ?? 0} LP · {recordLabel(games, rank.wins)} · {formatPercent(games ? rank.wins / games : 0)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="stats-empty">No hay rango de temporada disponible.</p>
        )}
      </section>

      <section aria-labelledby="scout-positions-heading" className="scout-section">
        <div className="scout-section-heading">
          <h2 id="scout-positions-heading">Rendimiento por posición</h2>
          <span>Últimas {stats.matches.length}</span>
        </div>
        <ul className="stats-list scout-position-list">
          {POSITIONS.map((position) => {
            const summary = positions.get(position);
            return (
              <li key={position}>
                <strong>{positionLabel(position)}</strong>
                <span>{summary ? recordLabel(summary.games, summary.wins) : '0 partidas'}</span>
                <span className="scout-metric">
                  <strong>{summary ? formatPercent(summary.winRate) : '—'}</strong>
                  <small>win rate</small>
                </span>
                <span className="scout-metric">
                  <strong>{summary ? formatKda(summary.kda) : '—'}</strong>
                  <small>KDA</small>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {profile?.seasonChampions.length ? (
        <section aria-labelledby="scout-season-heading" className="scout-section">
          <h2 id="scout-season-heading">Campeones de temporada</h2>
          <ul className="stats-list">
            {profile.seasonChampions.map((champion) => (
              <li className="champion-stat" key={champion.championId}>
                <ChampionIcon imageUrl={championImages.get(champion.championId)} name={champion.championName} />
                <div>
                  <p className="stat-row-title">{champion.championName}</p>
                  <p className="stat-row-meta">{recordLabel(champion.games, champion.wins)}</p>
                </div>
                <div className="stat-row-numbers">
                  <p className="stat-row-value">{formatPercent(champion.games ? champion.wins / champion.games : 0)}</p>
                  <p className="stat-row-meta">KDA {formatKda(kdaRatio(champion.kills, champion.deaths, champion.assists))}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="scout-recent-champions-heading" className="scout-section">
        <h2 id="scout-recent-champions-heading">Campeones recientes</h2>
        {recentChampions.length ? (
          <ul className="stats-list">
            {recentChampions.map((champion) => (
              <li className="champion-stat" key={champion.championId}>
                <ChampionIcon imageUrl={championImages.get(champion.championId)} name={champion.championName} />
                <div>
                  <p className="stat-row-title">{champion.championName}</p>
                  <p className="stat-row-meta">{recordLabel(champion.games, champion.wins)}</p>
                </div>
                <div className="stat-row-numbers">
                  <p className="stat-row-value">{formatPercent(champion.winRate)}</p>
                  <p className="stat-row-meta">KDA {formatKda(champion.kda)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="stats-empty">No encontramos partidas recientes para calcular campeones.</p>
        )}
      </section>

      <section aria-labelledby="scout-matches-heading" className="scout-section">
        <div className="scout-section-heading">
          <h2 id="scout-matches-heading">Partidas recientes</h2>
          {stats.syncedAt ? <span>Actualizado {timeAgo(stats.syncedAt, now)}</span> : null}
        </div>
        {stats.matches.length ? (
          <ul className="stats-list">
            {stats.matches.map((match) => (
              <MatchRow
                imageUrl={championImages.get(match.championId)}
                key={match.matchId}
                match={match}
                now={now}
                source="scout"
                userId={player.id}
              />
            ))}
          </ul>
        ) : (
          <p className="stats-empty">No encontramos partidas recientes.</p>
        )}
      </section>
    </div>
  );
}
