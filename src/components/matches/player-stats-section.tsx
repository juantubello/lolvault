import { getDb } from '@/db/client';
import { championImagesByKey } from '@/features/champions/champion-images';
import { loadPlayerStats } from '@/features/matches/player-stats';
import { getMatchProvider } from '@/features/matches/provider';
import { listInForceVaultsByChampionKey } from '@/features/vaults/vaults.queries';

import { PlayerStatsPanel } from './player-stats-panel';

type StatsUser = { id: number; riotGameName: string | null; riotTagLine: string | null };

/** Carga (con caché) y muestra las estadísticas. Va dentro de <Suspense>: OP.GG puede tardar. */
export async function PlayerStatsSection({ user, isSelf }: { user: StatsUser; isSelf: boolean }) {
  const db = getDb();
  const now = new Date();
  const stats = await loadPlayerStats(db, getMatchProvider(), user, now);

  return (
    <PlayerStatsPanel
      championImages={championImagesByKey(db)}
      isSelf={isSelf}
      now={now}
      stats={stats}
      vaultsByChampion={listInForceVaultsByChampionKey(db, user.id, now)}
    />
  );
}

export function PlayerStatsLoading() {
  return (
    <section aria-busy="true" aria-label="Estadísticas" className="stats-panel">
      <div className="stats-header">
        <h2>Estadísticas</h2>
      </div>
      <p className="stats-empty" role="status">
        Cargando partidas desde OP.GG…
      </p>
    </section>
  );
}
