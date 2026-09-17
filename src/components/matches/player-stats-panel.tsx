import { Gamepad2 } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { timeAgo } from '@/features/matches/format';
import type { PlayerStats } from '@/features/matches/player-stats';
import type { ChampionVault } from '@/features/vaults/vaults.queries';

import { PlayerPerformanceReport } from './player-performance-report';
import { RefreshStatsButton } from './refresh-stats-button';

export function PlayerStatsPanel({
  stats,
  championImages,
  vaultsByChampion,
  now,
  isSelf,
  userId,
}: {
  stats: PlayerStats;
  championImages: Map<number, string>;
  /** Vaults vigentes del jugador por `key` de campeón: se marcan en sus listas de campeones. */
  vaultsByChampion: Map<number, ChampionVault>;
  now: Date;
  isSelf: boolean;
  userId: number;
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

  return (
    <section aria-labelledby="stats-heading" className="stats-panel">
      <div className="stats-header">
        <div className="stats-header-copy">
          <h2 id="stats-heading">Estadísticas</h2>
          <span className="stats-source">
            OP.GG · {stats.riotId.gameName}#{stats.riotId.tagLine}
            {stats.syncedAt ? ` · Actualizado ${timeAgo(stats.syncedAt, now)}` : ''}
          </span>
        </div>
        <RefreshStatsButton userId={userId} />
      </div>

      <PlayerPerformanceReport
        analysisMode={isSelf ? 'self' : 'opponent'}
        championImages={championImages}
        now={now}
        stats={stats}
        userId={userId}
        vaultsByChampion={vaultsByChampion}
      />
    </section>
  );
}
