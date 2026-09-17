import {
  analyzeChampion,
  analyzeMatchup,
  ratingToWinrate,
  type Draft,
  type DraftMatrix,
  type DraftPick,
  type DraftRisk,
  type DraftSuggestion,
} from '@/features/draft/analysis';
import { playsRole } from '@/features/draft/role-eligibility';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';

/** El contrapick se busca entre los diez campeones con más partidas del rol, no en picks exóticos. */
export const DRAFT_COUNTERPICK_POPULAR_LIMIT = 10;

/**
 * Cuánto puede caer un pick si lo contrapickean bien, medido contra SU PROPIA expectativa.
 *
 * El umbral va sobre la caída y no sobre el piso, y la diferencia importa: un piso absoluto marca
 * todo cuando el draft entero va perdiendo. Medido sobre la matriz real con un draft en desventaja,
 * un corte en 47 % marcaba las 72 sugerencias — o sea, ninguna, porque una alerta que salta siempre
 * no distingue nada. La caída ya es relativa a cada pick, así que un umbral fijo sobre ella se
 * sostiene en cualquier draft. En esa misma medición las caídas iban de 0,84 a 4,62 puntos con
 * mediana en 2,31, así que 3 puntos marca alrededor del quinto peor.
 */
export const DRAFT_NOTABLY_BAD_DROP = 0.03;

export type MissingEnemySuggestionEstimate = {
  championKey: number;
  role: DraftRole;
  expectedRating: number;
  expectedWinrate: number;
  counterpickRating: number;
  counterpickWinrate: number;
  counterpickDrop: number;
  notablyBadFloor: boolean;
};

export type MissingEnemyRolePool = {
  role: DraftRole;
  eligibleChampionKeys: readonly number[];
};

export type MissingEnemyEstimates = {
  missingRoles: readonly DraftRole[];
  rolePools: readonly MissingEnemyRolePool[];
  suggestions: readonly MissingEnemySuggestionEstimate[];
};

type WeightedEnemy = {
  pick: DraftPick;
  games: number;
  baseRating: number;
};

type RolePrecomputation = {
  role: DraftRole;
  enemies: WeightedEnemy[];
  popularEnemies: WeightedEnemy[];
  totalGames: number;
  weightedBaseRating: number;
  matchupRatings: ReadonlyMap<string, ReadonlyMap<number, number>>;
  weightedMatchupRatings: ReadonlyMap<string, number>;
};

function pickKey(pick: DraftPick): string {
  return `${pick.championKey}:${pick.role}`;
}

function uniquePicks(picks: readonly DraftPick[]): DraftPick[] {
  const byKey = new Map<string, DraftPick>();
  for (const pick of picks) byKey.set(pickKey(pick), pick);
  return [...byKey.values()];
}

function precomputeRole(
  matrix: DraftMatrix,
  role: DraftRole,
  usedChampions: ReadonlySet<number>,
  alliedPicks: readonly DraftPick[],
  risk: DraftRisk,
): RolePrecomputation {
  const enemies = matrix.championKeys
    .filter((championKey) => (
      !usedChampions.has(championKey) && playsRole(matrix, championKey, role, risk)
    ))
    .map((championKey) => {
      const pick = { championKey, role };
      const champion = analyzeChampion(matrix, pick, risk);
      return { pick, games: champion.games, baseRating: champion.rating };
    });
  const totalGames = enemies.reduce((total, enemy) => total + enemy.games, 0);
  const weightedBaseRating = enemies.reduce(
    (total, enemy) => total + enemy.games * enemy.baseRating,
    0,
  );
  const matchupRatings = new Map<string, ReadonlyMap<number, number>>();
  const weightedMatchupRatings = new Map<string, number>();

  // Cada vector aliado se calcula una sola vez para este rol vacío. Después, evaluar cada
  // sugerencia sólo consulta estas sumas y, si corresponde, resta su propio campeón del pool.
  for (const ally of alliedPicks) {
    const byEnemy = new Map<number, number>();
    let weightedTotal = 0;
    for (const enemy of enemies) {
      const rating = analyzeMatchup(matrix, ally, enemy.pick, risk).rating;
      byEnemy.set(enemy.pick.championKey, rating);
      weightedTotal += enemy.games * rating;
    }
    matchupRatings.set(pickKey(ally), byEnemy);
    weightedMatchupRatings.set(pickKey(ally), weightedTotal);
  }

  return {
    role,
    enemies,
    popularEnemies: [...enemies]
      .sort((first, second) => (
        second.games - first.games || first.pick.championKey - second.pick.championKey
      )),
    totalGames,
    weightedBaseRating,
    matchupRatings,
    weightedMatchupRatings,
  };
}

function expectedMatchup(
  precomputed: RolePrecomputation,
  ally: DraftPick,
  excludedChampionKey: number,
  excludedGames: number,
): number {
  const denominator = precomputed.totalGames - excludedGames;
  if (denominator <= 0) return 0;
  const ratings = precomputed.matchupRatings.get(pickKey(ally));
  const excludedRating = ratings?.get(excludedChampionKey) ?? 0;
  const weighted = precomputed.weightedMatchupRatings.get(pickKey(ally)) ?? 0;
  return (weighted - excludedGames * excludedRating) / denominator;
}

function worstPopularMatchup(
  precomputed: RolePrecomputation,
  candidate: DraftPick,
): number | null {
  const ratings = precomputed.matchupRatings.get(pickKey(candidate));
  const available = precomputed.popularEnemies
    .filter((enemy) => enemy.pick.championKey !== candidate.championKey)
    .slice(0, DRAFT_COUNTERPICK_POPULAR_LIMIT)
    .flatMap((enemy) => {
      const rating = ratings?.get(enemy.pick.championKey);
      return rating === undefined ? [] : [rating];
    });
  return available.length ? Math.min(...available) : null;
}

/**
 * Agrega a cada sugerencia la expectativa de los roles rivales vacíos. `analyzeDraft` queda como
 * la foto exacta del tablero: esta función sólo suma una capa predictiva encima de ese resultado.
 */
export function estimateMissingEnemyPicks(
  matrix: DraftMatrix,
  draft: Draft,
  suggestions: readonly DraftSuggestion[],
  risk: DraftRisk,
): MissingEnemyEstimates {
  const occupiedEnemyRoles = new Set(draft.enemies.map(({ role }) => role));
  const missingRoles = DRAFT_ROLES.filter((role) => !occupiedEnemyRoles.has(role));

  if (missingRoles.length === 0) {
    return {
      missingRoles,
      rolePools: [],
      suggestions: suggestions.map((suggestion) => ({
        championKey: suggestion.championKey,
        role: suggestion.role,
        expectedRating: suggestion.analysis.totalRating,
        expectedWinrate: suggestion.winrate,
        counterpickRating: suggestion.analysis.totalRating,
        counterpickWinrate: suggestion.winrate,
        counterpickDrop: 0,
        notablyBadFloor: false,
      })),
    };
  }

  const usedChampions = new Set([
    ...draft.allies.map(({ championKey }) => championKey),
    ...draft.enemies.map(({ championKey }) => championKey),
  ]);
  const relevantAllies = uniquePicks([
    ...draft.allies,
    ...suggestions.map(({ championKey, role }) => ({ championKey, role })),
  ]);
  const roles = missingRoles.map((role) => (
    precomputeRole(matrix, role, usedChampions, relevantAllies, risk)
  ));
  const estimates = suggestions.map((suggestion) => {
    const candidate = { championKey: suggestion.championKey, role: suggestion.role };
    const allies = [...draft.allies, candidate];
    let expectedRating = suggestion.analysis.totalRating;
    let counterpickAdjustment = 0;

    for (const precomputed of roles) {
      const excluded = precomputed.enemies.find(
        (enemy) => enemy.pick.championKey === candidate.championKey,
      );
      const excludedGames = excluded?.games ?? 0;
      const denominator = precomputed.totalGames - excludedGames;
      if (denominator <= 0) continue;

      const expectedEnemyBase = (
        precomputed.weightedBaseRating - excludedGames * (excluded?.baseRating ?? 0)
      ) / denominator;
      const candidateExpectedMatchup = expectedMatchup(
        precomputed,
        candidate,
        candidate.championKey,
        excludedGames,
      );
      const expectedMatchups = allies.reduce((total, ally) => (
        total + expectedMatchup(
          precomputed,
          ally,
          candidate.championKey,
          excludedGames,
        )
      ), 0);

      expectedRating += expectedMatchups - expectedEnemyBase;
      const worst = worstPopularMatchup(precomputed, candidate);
      if (worst !== null) {
        // Las duplas que incluyen al campeón desconocido se omiten a propósito: son de segundo
        // orden y estimarlas agregaría ruido sin señal. Sólo reemplazamos el cruce del candidato.
        counterpickAdjustment += Math.min(0, worst - candidateExpectedMatchup);
      }
    }

    const expectedWinrate = ratingToWinrate(expectedRating);
    const counterpickRating = expectedRating + counterpickAdjustment;
    const counterpickWinrate = ratingToWinrate(counterpickRating);
    return {
      championKey: suggestion.championKey,
      role: suggestion.role,
      expectedRating,
      expectedWinrate,
      counterpickRating,
      counterpickWinrate,
      counterpickDrop: Math.max(0, expectedWinrate - counterpickWinrate),
      notablyBadFloor: Math.max(0, expectedWinrate - counterpickWinrate) >= DRAFT_NOTABLY_BAD_DROP,
    };
  });

  return {
    missingRoles,
    rolePools: roles.map((role) => ({
      role: role.role,
      eligibleChampionKeys: role.enemies.map((enemy) => enemy.pick.championKey),
    })),
    suggestions: estimates,
  };
}
