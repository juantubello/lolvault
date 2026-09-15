import { Gamepad2 } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { ChampionVaultBadge } from '@/components/vaults/champion-vault-badge';
import {
  formatAverage,
  formatDateTime,
  formatKda,
  formatPercent,
  POSITIONS,
  positionLabel,
  queueLabel,
  rankLabel,
} from '@/features/matches/format';
import type { PlayerStats } from '@/features/matches/player-stats';
import { kdaRatio, summarizeMatches } from '@/features/matches/player-summary';
import type { ChampionVault } from '@/features/vaults/vaults.queries';

import { ChampionIcon } from './champion-icon';
import { MatchRow } from './match-row';

export function PlayerStatsPanel({
  stats,
  championImages,
  vaultsByChampion,
  now,
  isSelf,
}: {
  stats: PlayerStats;
  championImages: Map<number, string>;
  /** Vaults vigentes del jugador por `key` de campeón: se marcan en sus listas de campeones. */
  vaultsByChampion: Map<number, ChampionVault>;
  now: Date;
  isSelf: boolean;
}) {
  if (stats.status === 'no-riot-id') {
    return (
      <section className="stats-panel" aria-label="Estadísticas">
        <EmptyState
          description={
            isSelf
              ? 'Agregá tu Riot ID en Editar perfil para ver tus partidas y estadísticas.'
              : 'Todavía no cargó su Riot ID, así que no hay partidas para mostrar.'
          }
          icon={Gamepad2}
          title="Sin Riot ID"
        />
        {isSelf ? (
          <Link className="clear-filters" href="/perfil/editar">
            Agregar Riot ID
          </Link>
        ) : null}
      </section>
    );
  }

  const summary = summarizeMatches(stats.matches);
  const ranks = (stats.profile?.ranks ?? []).filter((rank) => rank.tier);
  const seasonChampions = (stats.profile?.seasonChampions ?? []).slice(0, 5);
  const roleCounts = new Map(summary.roles.map((role) => [role.position, role.games]));
  const maxRole = Math.max(1, ...summary.roles.map((role) => role.games));

  return (
    <section aria-labelledby="stats-heading" className="stats-panel">
      <div className="stats-header">
        <h2 id="stats-heading">Estadísticas</h2>
        <span className="stats-source">
          OP.GG · {stats.riotId.gameName}#{stats.riotId.tagLine}
        </span>
      </div>

      {stats.error ? (
        <p className="stats-banner" role="status">
          {stats.error}
          {stats.syncedAt && !stats.notFound ? ` Datos del ${formatDateTime(stats.syncedAt)}.` : ''}
        </p>
      ) : null}

      {stats.matches.length === 0 ? (
        stats.error ? null : <p className="stats-empty">No encontramos partidas recientes.</p>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <p className="stat-label">Victorias · últimas {summary.games}</p>
              <p className="stat-value">{formatPercent(summary.winRate)}</p>
              <div
                aria-label={`${summary.wins} victorias y ${summary.losses} derrotas`}
                className="meter"
                role="img"
              >
                <span style={{ width: formatPercent(summary.winRate) }} />
              </div>
              <p className="stat-detail">
                {summary.wins} V · {summary.losses} D
              </p>
            </div>

            <div className="stat-tile">
              <p className="stat-label">KDA</p>
              <p className="stat-value">{formatKda(summary.kda)}</p>
              <p className="stat-detail">
                {formatAverage(summary.avgKills)} / {formatAverage(summary.avgDeaths)} /{' '}
                {formatAverage(summary.avgAssists)}
              </p>
            </div>

            <div className="stat-tile">
              <p className="stat-label">Participación en kills</p>
              <p className="stat-value">{formatPercent(summary.killParticipation)}</p>
            </div>

            {ranks.map((rank) => (
              <div className="stat-tile" key={rank.queue}>
                <p className="stat-label">{queueLabel(rank.queue)}</p>
                <p className="stat-value stat-value-rank">{rankLabel(rank)}</p>
                <p className="stat-detail">
                  {rank.lp ?? 0} LP · {rank.wins} V {rank.losses} D
                </p>
              </div>
            ))}
          </div>

          {summary.topChampions.length > 0 ? (
            <>
              <h3 className="stats-subtitle">Campeones de las últimas partidas</h3>
              <ul className="stats-list">
                {summary.topChampions.map((champion) => (
                  <li className="champion-stat" key={champion.championId}>
                    <ChampionIcon imageUrl={championImages.get(champion.championId)} name={champion.championName} />
                    <div>
                      <p className="stat-row-title">{champion.championName}</p>
                      <p className="stat-row-meta">
                        {champion.games} {champion.games === 1 ? 'partida' : 'partidas'} · {champion.wins} V{' '}
                        {champion.losses} D
                      </p>
                      <ChampionVaultBadge now={now} vault={vaultsByChampion.get(champion.championId)} />
                    </div>
                    <div className="stat-row-numbers">
                      <p className="stat-row-value">{formatPercent(champion.winRate)}</p>
                      <p className="stat-row-meta">KDA {formatKda(champion.kda)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {summary.roles.length > 0 ? (
            <>
              <h3 className="stats-subtitle">Roles</h3>
              <ul className="stats-list role-bars">
                {POSITIONS.map((position) => {
                  const games = roleCounts.get(position) ?? 0;
                  return (
                    <li key={position}>
                      <span>{positionLabel(position)}</span>
                      <span aria-hidden="true" className="role-bar">
                        <span style={{ width: `${(games / maxRole) * 100}%` }} />
                      </span>
                      <span className="role-count">{games}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {seasonChampions.length > 0 ? (
            <>
              <h3 className="stats-subtitle">Temporada · ranked</h3>
              <ul className="stats-list">
                {seasonChampions.map((champion) => (
                  <li className="champion-stat" key={champion.championId}>
                    <ChampionIcon imageUrl={championImages.get(champion.championId)} name={champion.championName} />
                    <div>
                      <p className="stat-row-title">{champion.championName}</p>
                      <p className="stat-row-meta">
                        {champion.games} partidas · {champion.wins} V {champion.losses} D
                      </p>
                      <ChampionVaultBadge now={now} vault={vaultsByChampion.get(champion.championId)} />
                    </div>
                    <div className="stat-row-numbers">
                      <p className="stat-row-value">{formatPercent(champion.games ? champion.wins / champion.games : 0)}</p>
                      <p className="stat-row-meta">
                        KDA {formatKda(kdaRatio(champion.kills, champion.deaths, champion.assists))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h3 className="stats-subtitle">Partidas recientes</h3>
          <ul className="stats-list">
            {stats.matches.map((match) => (
              <MatchRow imageUrl={championImages.get(match.championId)} key={match.matchId} match={match} now={now} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
