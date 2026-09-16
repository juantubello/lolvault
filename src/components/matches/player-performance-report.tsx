import { ChevronRight, ShieldAlert } from 'lucide-react';

import type { ChampionVault } from '@/features/vaults/vaults.queries';
import { ChampionVaultBadge } from '@/components/vaults/champion-vault-badge';
import {
  formatAverage,
  formatDuration,
  formatKda,
  formatNumber,
  formatPercent,
  positionLabel,
  queueLabel,
  rankLabel,
  timeAgo,
} from '@/features/matches/format';
import type { PlayerStats } from '@/features/matches/player-stats';
import { summarizeMatchesByChampion } from '@/features/matches/player-summary';
import type { RankedSeasonChampion } from '@/features/matches/types';
import {
  compareRecentToSeason,
  normalizeRankedChampion,
  summarizeScoutMatches,
} from '@/features/scout/scout-metrics';

import { ChampionIcon } from './champion-icon';
import { MatchRow } from './match-row';

type LoadedStats = Extract<PlayerStats, { status: 'ok' }>;

function recordLabel(games: number, wins: number): string {
  return `${games} ${games === 1 ? 'partida' : 'partidas'} · ${wins} V ${games - wins} D`;
}

function SignedWinRate({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const points = Math.round(delta * 100);
  return (
    <span className="comparison-delta" data-tone={points > 0 ? 'positive' : points < 0 ? 'negative' : 'neutral'}>
      {points > 0 ? '+' : ''}{points} puntos vs. temporada
    </span>
  );
}

function MetricGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="deep-metric-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RankedChampionDetails({ champion }: { champion: RankedSeasonChampion }) {
  const metrics = normalizeRankedChampion(champion);
  const { basic, extend } = champion;
  const perGame = (value: number) => value / Math.max(champion.games, 1);

  return (
    <details className="champion-deep-dive">
      <summary>
        <span>Ver análisis completo</span>
        <ChevronRight aria-hidden="true" size={18} strokeWidth={2} />
      </summary>
      <div className="champion-deep-content">
        <h4>Ritmo y rendimiento</h4>
        <MetricGrid items={[
          { label: 'KDA', value: formatKda(metrics.kda) },
          { label: 'Kills / partida', value: formatAverage(metrics.avgKills) },
          { label: 'Muertes / partida', value: formatAverage(metrics.avgDeaths) },
          { label: 'Asistencias / partida', value: formatAverage(metrics.avgAssists) },
          { label: 'Participación en kills', value: formatPercent(metrics.killParticipation) },
          { label: 'Participación de daño', value: formatPercent(metrics.damageParticipation) },
          { label: 'Distribución de daño', value: formatPercent(metrics.damageDistribution) },
          { label: 'CS / partida', value: formatAverage(metrics.csPerGame) },
          { label: 'CS / min', value: formatAverage(metrics.csPerMinute) },
          { label: 'Oro / partida', value: formatNumber(metrics.goldPerGame) },
          { label: 'OP Score', value: formatAverage(metrics.opScore) },
          { label: 'Puesto OP promedio', value: formatAverage(metrics.opScoreRank) },
          { label: 'Lane score', value: formatAverage(metrics.laneScore) },
          { label: 'Ventaja de línea', value: formatPercent(metrics.laneLeadRate) },
          { label: 'Duración promedio', value: formatDuration(metrics.avgDurationSeconds) },
        ]} />

        <h4>Daño y utilidad por partida</h4>
        <MetricGrid items={[
          { label: 'Daño a campeones', value: formatNumber(metrics.damagePerGame) },
          { label: 'Daño / min', value: formatNumber(metrics.damagePerMinute) },
          { label: 'Daño físico', value: formatNumber(metrics.physicalDamagePerGame) },
          { label: 'Daño mágico', value: formatNumber(metrics.magicDamagePerGame) },
          { label: 'Daño verdadero', value: formatNumber(metrics.trueDamagePerGame) },
          { label: 'Daño recibido', value: formatNumber(metrics.damageTakenPerGame) },
          { label: 'Daño mitigado', value: formatNumber(metrics.damageMitigatedPerGame) },
          { label: 'Curación', value: formatNumber(metrics.healPerGame) },
          { label: 'Curación al equipo', value: formatNumber(metrics.healToTeamPerGame) },
          { label: 'Escudo al equipo', value: formatNumber(metrics.shieldToTeamPerGame) },
          { label: 'Daño a objetivos', value: formatNumber(metrics.objectiveDamagePerGame) },
          { label: 'Daño a torres', value: formatNumber(metrics.turretDamagePerGame) },
          { label: 'Puntaje de CC', value: formatAverage(metrics.ccScorePerGame) },
        ]} />

        <h4>Visión y jugadas</h4>
        <MetricGrid items={[
          { label: 'Visión / partida', value: formatAverage(metrics.visionScorePerGame) },
          { label: 'Centinelas de control / partida', value: formatAverage(metrics.controlWardsPerGame) },
          { label: 'Centinelas puestos / partida', value: formatAverage(metrics.wardsPlacedPerGame) },
          { label: 'Centinelas limpiados / partida', value: formatAverage(metrics.wardsKilledPerGame) },
          { label: 'MVP', value: formatNumber(basic.mvp) },
          { label: 'ACE', value: formatNumber(basic.ace) },
          { label: 'Dobles', value: `${formatNumber(basic.doubleKills)} · ${formatNumber(basic.doubleKillGames)} partidas` },
          { label: 'Triples', value: `${formatNumber(basic.tripleKills)} · ${formatNumber(basic.tripleKillGames)} partidas` },
          { label: 'Cuádruples', value: `${formatNumber(basic.quadraKills)} · ${formatNumber(basic.quadraKillGames)} partidas` },
          { label: 'Pentakills', value: `${formatNumber(basic.pentaKills)} · ${formatNumber(basic.pentaKillGames)} partidas` },
          { label: 'Solo kills', value: `${formatNumber(extend.soloKills)} · ${formatNumber(extend.soloKillGames)} partidas` },
          { label: 'Kills en invade', value: `${formatNumber(extend.invadeKills)} · ${formatNumber(extend.invadeKillGames)} partidas` },
          { label: 'Partidas con invade', value: formatNumber(extend.invadeGames) },
          { label: 'Torres destruidas', value: formatNumber(extend.turretKills) },
          { label: 'Inhibidores', value: formatNumber(extend.inhibitorKills) },
          { label: 'Objetivos robados', value: formatNumber(extend.objectiveSteals) },
          { label: 'Placas', value: formatNumber(extend.turretPlates) },
        ]} />

        <h4>Mapa y situaciones</h4>
        <MetricGrid items={[
          { label: 'CS neutral / partida', value: formatAverage(perGame(extend.neutralCs)) },
          { label: 'Buffs robados', value: formatNumber(extend.buffSteals) },
          { label: 'Monstruos de jungla rival', value: formatNumber(extend.enemyJungleMonsterKills) },
          { label: 'Épicos cerca del jungla rival', value: formatNumber(extend.epicMonsterKillsNearEnemyJungler) },
          { label: 'Épicos robados sin Smite', value: formatNumber(extend.epicMonsterStealsWithoutSmite) },
          { label: 'Primer cangrejo', value: formatNumber(extend.initialCrabKills) },
          { label: 'CS de jungla al 10 / partida', value: formatAverage(perGame(extend.jungleCsAt10)) },
          { label: 'Ventaja al minuto 7', value: formatPercent(perGame(extend.laneAdvantagesAt7)) },
          { label: 'CS de línea al 10 / partida', value: formatAverage(perGame(extend.laneCsAt10)) },
          { label: 'Controles de masas', value: formatNumber(extend.crowdControls) },
          { label: 'Kills creadas con CC', value: formatNumber(extend.crowdControlKills) },
          { label: 'Aliados salvados', value: formatNumber(extend.alliesSaved) },
          { label: 'Centinelas protegidos', value: formatNumber(extend.wardsGuarded) },
          { label: 'Quest de support más rápida', value: formatNumber(extend.fasterSupportQuests) },
          { label: 'Evolución: ninguna', value: formatNumber(extend.evolutionNone) },
          { label: 'Evolución: primera', value: formatNumber(extend.evolutionFirst) },
          { label: 'Evolución: segunda', value: formatNumber(extend.evolutionSecond) },
        ]} />
      </div>
    </details>
  );
}

/**
 * Jerarquia deliberada para Scout movil: rol y campeon reciente primero (decision en diez
 * segundos), rango y comparacion despues; actividad, temporadas y detalle crudo quedan abajo en
 * disclosures. Perfil propio y Amigos reutilizan exactamente este mismo cuerpo estadistico.
 */
export function PlayerPerformanceReport({
  championImages,
  matchSource,
  now,
  stats,
  userId,
  vaultsByChampion = new Map(),
}: {
  championImages: Map<number, string>;
  matchSource?: 'scout';
  now: Date;
  stats: LoadedStats;
  userId: number;
  vaultsByChampion?: Map<number, ChampionVault>;
}) {
  const profile = stats.profile;
  const metrics = summarizeScoutMatches(stats.matches);
  const recentChampions = summarizeMatchesByChampion(stats.matches);
  const primaryRole = metrics.roles[0];
  const primaryChampion = recentChampions[0];
  const comparison = compareRecentToSeason(stats.matches, profile?.rankedSeason);
  const ranks = (profile?.ranks ?? []).filter((rank) => rank.tier);
  const seasonChampions = profile?.rankedSeason?.champions ?? [];
  const activeHours = metrics.hours.filter((hour) => hour.games > 0);
  const activeDays = metrics.weekdays.filter((day) => day.games > 0);

  return (
    <div className="player-performance-report">
      {stats.error ? (
        <p className="stats-banner" role="status">
          <ShieldAlert aria-hidden="true" size={18} strokeWidth={2} />
          <span>{stats.error}</span>
        </p>
      ) : null}

      {stats.matches.length === 0 && !profile ? (
        <p className="stats-empty">No encontramos partidas ni datos de temporada.</p>
      ) : (
        <>
          <section aria-labelledby="quick-read-heading" className="quick-read">
            <div className="scout-section-heading">
              <h2 id="quick-read-heading">Lectura rápida</h2>
              <span>Últimas {metrics.games}</span>
            </div>
            <div className="quick-read-grid">
              <article className="quick-read-card">
                <p className="stat-label">Rol principal</p>
                <p className="quick-read-value">{primaryRole ? positionLabel(primaryRole.key) : 'Sin datos'}</p>
                <p className="stat-detail">
                  {primaryRole
                    ? `${formatPercent(primaryRole.share)} de sus partidas · ${formatPercent(primaryRole.winRate)} WR`
                    : 'No hay posición registrada'}
                </p>
              </article>
              <article className="quick-read-card quick-read-champion">
                {primaryChampion ? (
                  <ChampionIcon imageUrl={championImages.get(primaryChampion.championId)} name={primaryChampion.championName} />
                ) : null}
                <div>
                  <p className="stat-label">Campeón reciente</p>
                  <p className="quick-read-value">{primaryChampion?.championName ?? 'Sin datos'}</p>
                  <p className="stat-detail">
                    {primaryChampion
                      ? `${recordLabel(primaryChampion.games, primaryChampion.wins)} · ${formatPercent(primaryChampion.winRate)} WR`
                      : 'No hay partidas completas'}
                  </p>
                </div>
              </article>
            </div>
          </section>

          <section aria-labelledby="recent-season-heading" className="scout-section">
            <h2 id="recent-season-heading">Ahora vs. temporada</h2>
            <div className="comparison-grid">
              <article>
                <p className="stat-label">Últimas {comparison.recent.games}</p>
                <p className="stat-value">{formatPercent(comparison.recent.winRate)}</p>
                <p className="stat-detail">{comparison.recent.wins} V · {comparison.recent.losses} D</p>
              </article>
              <article>
                <p className="stat-label">Temporada ranked</p>
                <p className="stat-value">
                  {comparison.season ? formatPercent(comparison.season.winRate) : '—'}
                </p>
                <p className="stat-detail">
                  {comparison.season
                    ? `${comparison.season.games} partidas · ${comparison.season.wins} V ${comparison.season.losses} D`
                    : 'Sin total de temporada'}
                </p>
              </article>
            </div>
            <SignedWinRate delta={comparison.winRateDelta} />
          </section>

          <section aria-labelledby="recent-metrics-heading" className="scout-section">
            <h2 id="recent-metrics-heading">Ritmo reciente</h2>
            <div className="stat-tiles compact-stat-tiles">
              <div className="stat-tile"><p className="stat-label">KDA</p><p className="stat-value">{formatKda(metrics.kda)}</p><p className="stat-detail">{formatAverage(metrics.avgKills)} / {formatAverage(metrics.avgDeaths)} / {formatAverage(metrics.avgAssists)}</p></div>
              <div className="stat-tile"><p className="stat-label">Participación en kills</p><p className="stat-value">{formatPercent(metrics.killParticipation)}</p></div>
              <div className="stat-tile"><p className="stat-label">CS / min</p><p className="stat-value">{formatAverage(metrics.csPerMinute)}</p></div>
              <div className="stat-tile"><p className="stat-label">Daño / min</p><p className="stat-value">{formatNumber(metrics.damagePerMinute)}</p></div>
              <div className="stat-tile"><p className="stat-label">Duración promedio</p><p className="stat-value stat-value-rank">{formatDuration(metrics.avgDurationSeconds)}</p></div>
            </div>
          </section>

          {ranks.length || profile?.ladder ? (
            <section aria-labelledby="rank-heading" className="scout-section">
              <h2 id="rank-heading">Rango actual</h2>
              <div className="stat-tiles">
                {ranks.map((rank) => (
                  <div className="stat-tile" key={rank.queue}>
                    <p className="stat-label">{queueLabel(rank.queue)}</p>
                    <p className="stat-value stat-value-rank">{rankLabel(rank)}</p>
                    <p className="stat-detail">{rank.lp ?? 0} LP · {recordLabel(rank.wins + rank.losses, rank.wins)}</p>
                  </div>
                ))}
                {profile?.ladder ? (
                  <div className="stat-tile">
                    <p className="stat-label">Ladder</p>
                    <p className="stat-value stat-value-rank">Puesto {formatNumber(profile.ladder.rank)}</p>
                    <p className="stat-detail">entre {formatNumber(profile.ladder.total)} jugadores</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {recentChampions.length ? (
            <section aria-labelledby="recent-champions-heading" className="scout-section">
              <h2 id="recent-champions-heading">Lo que viene jugando</h2>
              <ul className="stats-list">
                {recentChampions.slice(0, 3).map((champion) => (
                  <li className="champion-stat" key={champion.championId}>
                    <ChampionIcon imageUrl={championImages.get(champion.championId)} name={champion.championName} />
                    <div>
                      <p className="stat-row-title">{champion.championName}</p>
                      <p className="stat-row-meta">{recordLabel(champion.games, champion.wins)}</p>
                      <ChampionVaultBadge now={now} vault={vaultsByChampion.get(champion.championId)} />
                    </div>
                    <div className="stat-row-numbers">
                      <p className="stat-row-value">{formatPercent(champion.winRate)}</p>
                      <p className="stat-row-meta">KDA {formatKda(champion.kda)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <details className="stats-disclosure">
            <summary><span>Roles, actividad y lado</span><ChevronRight aria-hidden="true" size={20} strokeWidth={2} /></summary>
            <div className="stats-disclosure-content">
              <h3>Reparto de roles</h3>
              {metrics.roles.length ? (
                <ul className="stats-list pattern-list">
                  {metrics.roles.map((role) => (
                    <li key={role.key}>
                      <span><strong>{positionLabel(role.key)}</strong><small>{formatPercent(role.share)} del historial</small></span>
                      <span>{role.games} P</span><span>{formatPercent(role.winRate)} WR</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="stats-empty">No hay roles registrados.</p>}

              <h3>Días de actividad</h3>
              <ul className="stats-list pattern-list">
                {activeDays.map((day) => (
                  <li key={day.key}><span><strong>{day.label}</strong><small>{formatPercent(day.share)} del historial</small></span><span>{day.games} P</span><span>{formatPercent(day.winRate)} WR</span></li>
                ))}
              </ul>

              <h3>Horarios de actividad</h3>
              <p className="stats-context">Hora de Buenos Aires.</p>
              <ul className="stats-list pattern-list activity-hours">
                {activeHours.map((hour) => (
                  <li key={hour.key}><span><strong>{hour.label}</strong><small>{formatPercent(hour.share)} del historial</small></span><span>{hour.games} P</span><span>{formatPercent(hour.winRate)} WR</span></li>
                ))}
              </ul>

              <h3>Lado azul / rojo</h3>
              <div className="side-grid">
                {metrics.sides.map((side) => (
                  <article key={side.key} data-side={side.key.toLocaleLowerCase('en-US')}>
                    <p className="stat-label">{side.label}</p>
                    <p className="stat-value">{side.games ? formatPercent(side.winRate) : '—'}</p>
                    <p className="stat-detail">{side.games} partidas · {formatPercent(side.share)} del historial</p>
                  </article>
                ))}
              </div>
            </div>
          </details>

          {seasonChampions.length ? (
            <details className="stats-disclosure">
              <summary><span>Campeones de temporada</span><small>{seasonChampions.length}</small><ChevronRight aria-hidden="true" size={20} strokeWidth={2} /></summary>
              <div className="stats-disclosure-content season-champion-list">
                {seasonChampions.map((champion) => {
                  const championMetrics = normalizeRankedChampion(champion);
                  return (
                    <article className="season-champion-card" key={champion.championId}>
                      <header>
                        <ChampionIcon imageUrl={championImages.get(champion.championId)} name={champion.championName} />
                        <div>
                          <h3>{champion.championName}</h3>
                          <p>{recordLabel(champion.games, champion.wins)} · {formatPercent(championMetrics.winRate)} WR</p>
                          <ChampionVaultBadge now={now} vault={vaultsByChampion.get(champion.championId)} />
                        </div>
                        <strong>KDA {formatKda(championMetrics.kda)}</strong>
                      </header>
                      <div className="champion-key-metrics">
                        <span><strong>{formatPercent(championMetrics.killParticipation)}</strong><small>KP</small></span>
                        <span><strong>{formatAverage(championMetrics.csPerGame)}</strong><small>CS / partida</small></span>
                        <span><strong>{formatAverage(championMetrics.opScore)}</strong><small>OP Score</small></span>
                        <span><strong>{formatPercent(championMetrics.damageParticipation)}</strong><small>Daño del equipo</small></span>
                      </div>
                      <RankedChampionDetails champion={champion} />
                    </article>
                  );
                })}
              </div>
            </details>
          ) : profile?.seasonChampions.length ? (
            <details className="stats-disclosure">
              <summary><span>Campeones de temporada</span><small>{profile.seasonChampions.length}</small><ChevronRight aria-hidden="true" size={20} strokeWidth={2} /></summary>
              <ul className="stats-list stats-disclosure-list">
                {profile.seasonChampions.map((champion) => (
                  <li className="champion-stat" key={champion.championId}>
                    <ChampionIcon imageUrl={championImages.get(champion.championId)} name={champion.championName} />
                    <div><p className="stat-row-title">{champion.championName}</p><p className="stat-row-meta">{recordLabel(champion.games, champion.wins)}</p></div>
                    <p className="stat-row-value">{formatPercent(champion.games ? champion.wins / champion.games : 0)}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {profile?.previousSeasons?.length ? (
            <details className="stats-disclosure">
              <summary><span>Historial de temporadas</span><small>{profile.previousSeasons.length}</small><ChevronRight aria-hidden="true" size={20} strokeWidth={2} /></summary>
              <ul className="stats-list season-history stats-disclosure-list">
                {profile.previousSeasons.map((season) => (
                  <li key={season.seasonId}>
                    <span>Temporada {season.seasonId}</span>
                    <strong>{rankLabel({ queue: 'SOLORANKED', tier: season.tier, division: season.division, lp: season.lp, wins: 0, losses: 0, tierImageUrl: null }) ?? 'Sin rango'}</strong>
                    <small>{season.lp === null ? 'Sin LP' : `${season.lp} LP`}</small>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <details className="stats-disclosure">
            <summary><span>Partidas recientes</span><small>{stats.matches.length}{stats.syncedAt ? ` · ${timeAgo(stats.syncedAt, now)}` : ''}</small><ChevronRight aria-hidden="true" size={20} strokeWidth={2} /></summary>
            {stats.matches.length ? (
              <ul className="stats-list stats-disclosure-list">
                {stats.matches.map((match) => (
                  <MatchRow
                    imageUrl={championImages.get(match.championId)}
                    key={match.matchId}
                    match={match}
                    now={now}
                    source={matchSource}
                    userId={userId}
                  />
                ))}
              </ul>
            ) : <p className="stats-empty stats-disclosure-list">No encontramos partidas recientes.</p>}
          </details>
        </>
      )}
    </div>
  );
}
