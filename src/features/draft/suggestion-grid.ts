import {
  getSuggestions,
  ratingToWinrate,
  type Draft,
  type DraftMatrix,
  type DraftRisk,
} from '@/features/draft/analysis';
import type { DraftSlot } from '@/features/draft/draft-url';
import { estimateMissingEnemyPicks } from '@/features/draft/expected-enemy';
import {
  DRAFT_ROLE_MIN_GAMES,
  DRAFT_ROLE_MIN_SHARE,
  playsRole,
} from '@/features/draft/role-eligibility';

export type DraftChampionCatalogItem = {
  key: number;
  name: string;
  imageUrl: string;
  searchKey: string;
};

/**
 * `suggestion` son los candidatos reales del rol, todos medidos en la misma unidad; `off-role` es
 * el resto, que se puede elegir igual pero no compite porque su número no significaría nada.
 */
export type DraftChampionGridKind = 'suggestion' | 'off-role';

export type DraftChampionGridItem = DraftChampionCatalogItem & {
  kind: DraftChampionGridKind;
  winrate: number | null;
  boardWinrate: number | null;
  counterpickWinrate: number | null;
  counterpickDrop: number | null;
  notablyBadFloor: boolean;
  missingEnemyRoles: number;
  matchupPoints: number | null;
  synergyPoints: number | null;
};

export { DRAFT_ROLE_MIN_GAMES, DRAFT_ROLE_MIN_SHARE, playsRole };

function ratingPoints(rating: number): number {
  return (ratingToWinrate(rating) - 0.5) * 100;
}

/**
 * Arma la única porción del análisis que cruza el borde cliente: una lista chica, ordenada y
 * serializable. Para el enemigo se invierte el draft y el porcentaje queda desde su perspectiva.
 */
export function buildDraftChampionGrid({
  matrix,
  draft,
  slot,
  risk,
  champions,
}: {
  matrix: DraftMatrix;
  draft: Draft;
  slot: DraftSlot;
  risk: DraftRisk;
  champions: readonly DraftChampionCatalogItem[];
}): DraftChampionGridItem[] {
  const draftWithoutSlot: Draft = {
    allies: slot.team === 'allies'
      ? draft.allies.filter((pick) => pick.role !== slot.role)
      : draft.allies,
    enemies: slot.team === 'enemies'
      ? draft.enemies.filter((pick) => pick.role !== slot.role)
      : draft.enemies,
  };
  const perspective = slot.team === 'allies'
    ? draftWithoutSlot
    : { allies: draftWithoutSlot.enemies, enemies: draftWithoutSlot.allies };
  const used = new Set([...draft.allies, ...draft.enemies].map((pick) => pick.championKey));
  const available = champions.filter((champion) => !used.has(champion.key));
  const eligible = available.filter((champion) => playsRole(matrix, champion.key, slot.role, risk));
  // getSuggestions recorre matrix.championKeys sin filtrar la lane. Acotamos sólo esa lista
  // (los índices pesados se comparten) para que un pick sin datos del rol no desplace al top real.
  // Pedimos el ranking completo, no un top: así toda la grilla habla en la misma unidad y no hay
  // una segunda tanda midiendo otra cosa. Medido: 6-9 ms para los ~70 elegibles de un rol.
  const suggestions = getSuggestions({
    ...matrix,
    championKeys: eligible.map((champion) => champion.key),
  }, perspective, { risk, topN: eligible.length })
    .find((group) => group.role === slot.role)?.suggestions ?? [];
  const missingEnemies = estimateMissingEnemyPicks(matrix, perspective, suggestions, risk);
  const estimatesByKey = new Map(
    missingEnemies.suggestions.map((estimate) => [estimate.championKey, estimate]),
  );
  const byKey = new Map(eligible.map((champion) => [champion.key, champion]));
  const ranked = suggestions.flatMap((suggestion) => {
    const champion = byKey.get(suggestion.championKey);
    if (!champion) return [];
    const estimate = estimatesByKey.get(suggestion.championKey);
    const countsMissingEnemies = missingEnemies.missingRoles.length > 0;
    return [{
      ...champion,
      kind: 'suggestion' as const,
      winrate: countsMissingEnemies ? estimate?.expectedWinrate ?? suggestion.winrate : suggestion.winrate,
      boardWinrate: countsMissingEnemies ? suggestion.winrate : null,
      counterpickWinrate: countsMissingEnemies ? estimate?.counterpickWinrate ?? null : null,
      counterpickDrop: countsMissingEnemies ? estimate?.counterpickDrop ?? null : null,
      notablyBadFloor: countsMissingEnemies && Boolean(estimate?.notablyBadFloor),
      missingEnemyRoles: missingEnemies.missingRoles.length,
      matchupPoints: ratingPoints(suggestion.analysis.matchupRating),
      synergyPoints: ratingPoints(suggestion.analysis.allyDuoRating),
    }];
  }).sort((first, second) => (
    (second.winrate ?? 0) - (first.winrate ?? 0) || first.key - second.key
  ));
  const offRole = available
    .filter((champion) => !byKey.has(champion.key))
    .map((champion) => ({
      ...champion,
      kind: 'off-role' as const,
      winrate: null,
      boardWinrate: null,
      counterpickWinrate: null,
      counterpickDrop: null,
      notablyBadFloor: false,
      missingEnemyRoles: missingEnemies.missingRoles.length,
      matchupPoints: null,
      synergyPoints: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return [...ranked, ...offRole];
}
