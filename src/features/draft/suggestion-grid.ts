import {
  analyzeChampion,
  getSuggestions,
  ratingToWinrate,
  type Draft,
  type DraftMatrix,
  type DraftRisk,
} from '@/features/draft/analysis';
import type { DraftSlot } from '@/features/draft/draft-url';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';

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
  matchupPoints: number | null;
  synergyPoints: number | null;
};

/** Mínimos para considerar que un campeón juega un rol. Medidos sobre la matriz: §1.5.3 del plan. */
export const DRAFT_ROLE_MIN_GAMES = 1_000;
export const DRAFT_ROLE_MIN_SHARE = 0.02;

function ratingPoints(rating: number): number {
  return (ratingToWinrate(rating) - 0.5) * 100;
}

function gamesInRole(
  matrix: DraftMatrix,
  championKey: number,
  role: DraftRole,
  risk: DraftRisk,
): number {
  return analyzeChampion(matrix, { championKey, role }, risk).games;
}

/**
 * Un campeón sin partidas en el rol recibe rating 0, o sea exactamente neutral, y eso le gana a
 * cualquier pick real con matchups malos: sin este filtro la lista recomienda Sivir support por
 * encima de Thresh. Pedimos volumen absoluto y que el rol sea una parte real de su juego.
 */
export function playsRole(
  matrix: DraftMatrix,
  championKey: number,
  role: DraftRole,
  risk: DraftRisk,
): boolean {
  const roleGames = gamesInRole(matrix, championKey, role, risk);
  if (roleGames < DRAFT_ROLE_MIN_GAMES) return false;
  const totalGames = DRAFT_ROLES.reduce(
    (total, each) => total + gamesInRole(matrix, championKey, each, risk),
    0,
  );
  return roleGames >= totalGames * DRAFT_ROLE_MIN_SHARE;
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
  const byKey = new Map(eligible.map((champion) => [champion.key, champion]));
  const ranked = suggestions.flatMap((suggestion) => {
    const champion = byKey.get(suggestion.championKey);
    if (!champion) return [];
    return [{
      ...champion,
      kind: 'suggestion' as const,
      winrate: suggestion.winrate,
      matchupPoints: ratingPoints(suggestion.analysis.matchupRating),
      synergyPoints: ratingPoints(suggestion.analysis.allyDuoRating),
    }];
  });
  const offRole = available
    .filter((champion) => !byKey.has(champion.key))
    .map((champion) => ({
      ...champion,
      kind: 'off-role' as const,
      winrate: null,
      matchupPoints: null,
      synergyPoints: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return [...ranked, ...offRole];
}
