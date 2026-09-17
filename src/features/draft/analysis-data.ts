import type { Db } from '@/db/client';
import { champions, draftChampionStats, draftMatchups, draftSynergies } from '@/db/schema';
import { buildDraftMatrix, type DraftMatrix } from '@/features/draft/analysis';
import type { DraftRole } from '@/features/draft/types';

/**
 * Único borde con SQLite del motor. Materializa cada tabla una vez y entrega índices en memoria;
 * ni analyzeDraft ni getSuggestions pueden consultar la base desde sus bucles.
 */
export function loadDraftMatrix(db: Db): DraftMatrix {
  const championRows = db.select({ key: champions.key }).from(champions).all();
  const championStats = db.select().from(draftChampionStats).all();
  const matchups = db.select().from(draftMatchups).all();
  const synergies = db.select().from(draftSynergies).all();

  return buildDraftMatrix({
    championKeys: championRows.flatMap(({ key }) => key === null ? [] : [key]),
    championStats: championStats.map((row) => ({
      championKey: row.championKey,
      role: row.role as DraftRole,
      games: row.games,
      wins: row.wins,
    })),
    matchups: matchups.map((row) => ({
      championKey: row.championKey,
      role: row.role as DraftRole,
      enemyChampionKey: row.enemyChampionKey,
      enemyRole: row.enemyRole as DraftRole,
      games: row.games,
      wins: row.wins,
    })),
    synergies: synergies.map((row) => ({
      championKey: row.championKey,
      role: row.role as DraftRole,
      allyChampionKey: row.allyChampionKey,
      allyRole: row.allyRole as DraftRole,
      games: row.games,
      wins: row.wins,
    })),
  });
}
