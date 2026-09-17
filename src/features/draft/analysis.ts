import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';

/**
 * Motor basado en la matemática de DraftGap (MIT): https://github.com/vigovlugt/draftgap
 *
 * Este módulo no lee la base ni conoce la fuente de datos. Recibe una foto inmutable de la
 * matriz para que analizar un draft y probar candidatos sean operaciones puras.
 */

export const DRAFT_PRIOR_GAMES = {
  'very-low': 3_000,
  low: 2_000,
  medium: 1_000,
  high: 500,
  'very-high': 250,
} as const;

export type DraftRisk = keyof typeof DRAFT_PRIOR_GAMES;

export type DraftPick = {
  championKey: number;
  role: DraftRole;
};

export type Draft = {
  allies: readonly DraftPick[];
  enemies: readonly DraftPick[];
};

export type DraftStatLine = {
  games: number;
  wins: number;
};

export type DraftChampionStatRow = DraftPick & DraftStatLine;

export type DraftMatchupRow = DraftPick & DraftStatLine & {
  enemyChampionKey: number;
  enemyRole: DraftRole;
};

export type DraftSynergyRow = DraftPick & DraftStatLine & {
  allyChampionKey: number;
  allyRole: DraftRole;
};

export type DraftMatrix = {
  championKeys: readonly number[];
  championStats: ReadonlyMap<string, DraftStatLine>;
  matchups: ReadonlyMap<string, DraftStatLine>;
  synergies: ReadonlyMap<string, DraftStatLine>;
};

export type DraftMatrixRows = {
  championKeys: readonly number[];
  championStats: readonly DraftChampionStatRow[];
  matchups: readonly DraftMatchupRow[];
  synergies: readonly DraftSynergyRow[];
};

export type ChampionAnalysis = DraftPick & DraftStatLine & {
  rating: number;
  winrate: number;
  hasData: boolean;
};

export type PairAnalysis = {
  first: DraftPick;
  second: DraftPick;
  games: number;
  wins: number;
  expectedRating: number;
  expectedWinrate: number;
  rating: number;
  /** Win rate normalizado: 50 % significa que el par rindió exactamente como se esperaba. */
  winrate: number;
  hasData: boolean;
};

export type DraftAnalysis = {
  allyChampionRating: number;
  enemyChampionRating: number;
  allyDuoRating: number;
  enemyDuoRating: number;
  matchupRating: number;
  totalRating: number;
  winrate: number;
  allyChampions: ChampionAnalysis[];
  enemyChampions: ChampionAnalysis[];
  allyDuos: PairAnalysis[];
  enemyDuos: PairAnalysis[];
  matchups: PairAnalysis[];
};

export type DraftSuggestion = {
  championKey: number;
  role: DraftRole;
  winrate: number;
  analysis: DraftAnalysis;
};

export type DraftRoleSuggestions = {
  role: DraftRole;
  suggestions: DraftSuggestion[];
};

function pickKey(pick: DraftPick): string {
  return `${pick.championKey}:${pick.role}`;
}

function pairKey(first: DraftPick, second: DraftPick): string {
  return `${pickKey(first)}>${pickKey(second)}`;
}

/** Convierte diferencia Elo a probabilidad, con la escala clásica de 400 puntos. */
export function ratingToWinrate(rating: number): number {
  return 1 / (1 + 10 ** (-rating / 400));
}

/** Inversa de ratingToWinrate. En 0 y 1 devuelve los infinitos matemáticos correspondientes. */
export function winrateToRating(winrate: number): number {
  return -400 * Math.log10(1 / winrate - 1);
}

function priorGames(risk: DraftRisk): number {
  return DRAFT_PRIOR_GAMES[risk];
}

function adjustedWinrate(
  stats: DraftStatLine,
  expectedWinrate: number,
  risk: DraftRisk,
): number {
  const prior = priorGames(risk);
  return (stats.wins + prior * expectedWinrate) / (stats.games + prior);
}

/** Construye los índices una vez; analizar y sugerir después no recorren las tablas originales. */
export function buildDraftMatrix(rows: DraftMatrixRows): DraftMatrix {
  const championStats = new Map<string, DraftStatLine>();
  const matchups = new Map<string, DraftStatLine>();
  const synergies = new Map<string, DraftStatLine>();

  for (const row of rows.championStats) {
    championStats.set(pickKey(row), { games: row.games, wins: row.wins });
  }
  for (const row of rows.matchups) {
    matchups.set(pairKey(row, {
      championKey: row.enemyChampionKey,
      role: row.enemyRole,
    }), { games: row.games, wins: row.wins });
  }
  for (const row of rows.synergies) {
    synergies.set(pairKey(row, {
      championKey: row.allyChampionKey,
      role: row.allyRole,
    }), { games: row.games, wins: row.wins });
  }

  return {
    championKeys: [...new Set(rows.championKeys)].sort((a, b) => a - b),
    championStats,
    matchups,
    synergies,
  };
}

export function analyzeChampion(
  matrix: DraftMatrix,
  pick: DraftPick,
  risk: DraftRisk = 'medium',
): ChampionAnalysis {
  const stats = matrix.championStats.get(pickKey(pick));
  if (!stats) {
    return { ...pick, games: 0, wins: 0, rating: 0, winrate: 0.5, hasData: false };
  }
  const winrate = adjustedWinrate(stats, 0.5, risk);
  return {
    ...pick,
    ...stats,
    rating: winrateToRating(winrate),
    winrate,
    hasData: true,
  };
}

function neutralPair(
  first: DraftPick,
  second: DraftPick,
  expectedRating: number,
): PairAnalysis {
  return {
    first,
    second,
    games: 0,
    wins: 0,
    expectedRating,
    expectedWinrate: ratingToWinrate(expectedRating),
    rating: 0,
    winrate: 0.5,
    hasData: false,
  };
}

/**
 * Matchup dirigido A contra B. Usa la resta de ratings base y, para cancelar el sesgo de la
 * fuente, combina las victorias de A con las derrotas informadas para B contra A.
 */
export function analyzeMatchup(
  matrix: DraftMatrix,
  ally: DraftPick,
  enemy: DraftPick,
  risk: DraftRisk = 'medium',
): PairAnalysis {
  const allyRating = analyzeChampion(matrix, ally, risk).rating;
  const enemyRating = analyzeChampion(matrix, enemy, risk).rating;
  const expectedRating = allyRating - enemyRating;
  const forward = matrix.matchups.get(pairKey(ally, enemy));
  const reverse = matrix.matchups.get(pairKey(enemy, ally));
  if (!forward || !reverse) return neutralPair(ally, enemy, expectedRating);

  const stats = {
    games: (forward.games + reverse.games) / 2,
    wins: (forward.wins + reverse.games - reverse.wins) / 2,
  };
  const expectedWinrate = ratingToWinrate(expectedRating);
  const actualRating = winrateToRating(adjustedWinrate(stats, expectedWinrate, risk));
  const rating = actualRating - expectedRating;
  return {
    first: ally,
    second: enemy,
    ...stats,
    expectedRating,
    expectedWinrate,
    rating,
    winrate: ratingToWinrate(rating),
    hasData: true,
  };
}

/**
 * Dupla no dirigida A con B. Acá los ratings base se suman y las dos direcciones se promedian
 * tal cual: invertir victorias/derrotas sería aplicar por error la fórmula de matchup.
 */
export function analyzeDuo(
  matrix: DraftMatrix,
  first: DraftPick,
  second: DraftPick,
  risk: DraftRisk = 'medium',
): PairAnalysis {
  const firstRating = analyzeChampion(matrix, first, risk).rating;
  const secondRating = analyzeChampion(matrix, second, risk).rating;
  const expectedRating = firstRating + secondRating;
  const forward = matrix.synergies.get(pairKey(first, second));
  const reverse = matrix.synergies.get(pairKey(second, first));
  if (!forward || !reverse) return neutralPair(first, second, expectedRating);

  const stats = {
    games: (forward.games + reverse.games) / 2,
    wins: (forward.wins + reverse.wins) / 2,
  };
  const expectedWinrate = ratingToWinrate(expectedRating);
  const actualRating = winrateToRating(adjustedWinrate(stats, expectedWinrate, risk));
  const rating = actualRating - expectedRating;
  return {
    first,
    second,
    ...stats,
    expectedRating,
    expectedWinrate,
    rating,
    winrate: ratingToWinrate(rating),
    hasData: true,
  };
}

function analyzeDuos(
  matrix: DraftMatrix,
  picks: readonly DraftPick[],
  risk: DraftRisk,
): PairAnalysis[] {
  const pairs: PairAnalysis[] = [];
  for (let first = 0; first < picks.length; first += 1) {
    for (let second = first + 1; second < picks.length; second += 1) {
      const firstPick = picks[first];
      const secondPick = picks[second];
      if (firstPick && secondPick) pairs.push(analyzeDuo(matrix, firstPick, secondPick, risk));
    }
  }
  return pairs;
}

function validateTeam(picks: readonly DraftPick[], name: string): void {
  if (picks.length > DRAFT_ROLES.length) throw new Error(`${name} no puede tener más de 5 picks`);
  if (new Set(picks.map(({ role }) => role)).size !== picks.length) {
    throw new Error(`${name} no puede repetir roles`);
  }
  if (new Set(picks.map(({ championKey }) => championKey)).size !== picks.length) {
    throw new Error(`${name} no puede repetir campeones`);
  }
}

function sumRatings(items: readonly { rating: number }[]): number {
  return items.reduce((total, item) => total + item.rating, 0);
}

export function analyzeDraft(
  matrix: DraftMatrix,
  draft: Draft,
  risk: DraftRisk = 'medium',
): DraftAnalysis {
  validateTeam(draft.allies, 'El equipo aliado');
  validateTeam(draft.enemies, 'El equipo enemigo');

  const allyChampions = draft.allies.map((pick) => analyzeChampion(matrix, pick, risk));
  const enemyChampions = draft.enemies.map((pick) => analyzeChampion(matrix, pick, risk));
  const allyDuos = analyzeDuos(matrix, draft.allies, risk);
  const enemyDuos = analyzeDuos(matrix, draft.enemies, risk);
  const matchups = draft.allies.flatMap((ally) => draft.enemies.map((enemy) => (
    analyzeMatchup(matrix, ally, enemy, risk)
  )));
  const allyChampionRating = sumRatings(allyChampions);
  const enemyChampionRating = sumRatings(enemyChampions);
  const allyDuoRating = sumRatings(allyDuos);
  const enemyDuoRating = sumRatings(enemyDuos);
  const matchupRating = sumRatings(matchups);
  const rawTotal = allyChampionRating + allyDuoRating + matchupRating
    - enemyChampionRating - enemyDuoRating;
  // Las dos direcciones de una comp espejo son opuestas. Eliminamos sólo ruido de coma flotante.
  const totalRating = Math.abs(rawTotal) < 1e-10 ? 0 : rawTotal;

  return {
    allyChampionRating,
    enemyChampionRating,
    allyDuoRating,
    enemyDuoRating,
    matchupRating,
    totalRating,
    winrate: ratingToWinrate(totalRating),
    allyChampions,
    enemyChampions,
    allyDuos,
    enemyDuos,
    matchups,
  };
}

function suggestionBefore(first: DraftSuggestion, second: DraftSuggestion): boolean {
  return first.winrate > second.winrate
    || (first.winrate === second.winrate && first.championKey < second.championKey);
}

/** Mantiene el top acotado durante la única pasada por la lista de campeones. */
function addToTop(
  top: DraftSuggestion[],
  suggestion: DraftSuggestion,
  limit: number,
): void {
  const index = top.findIndex((current) => suggestionBefore(suggestion, current));
  if (index < 0) {
    if (top.length < limit) top.push(suggestion);
    return;
  }
  top.splice(index, 0, suggestion);
  if (top.length > limit) top.pop();
}

/**
 * Sugiere picks aliados para todos sus roles libres. La matriz ya está en memoria y la lista de
 * campeones se recorre una sola vez, calculando dentro de esa pasada cada rol todavía disponible.
 */
export function getSuggestions(
  matrix: DraftMatrix,
  draft: Draft,
  options: { risk?: DraftRisk; topN?: number } = {},
): DraftRoleSuggestions[] {
  validateTeam(draft.allies, 'El equipo aliado');
  validateTeam(draft.enemies, 'El equipo enemigo');
  const risk = options.risk ?? 'medium';
  const topN = Math.max(0, Math.floor(options.topN ?? 5));
  const occupiedRoles = new Set(draft.allies.map(({ role }) => role));
  const freeRoles = DRAFT_ROLES.filter((role) => !occupiedRoles.has(role));
  const usedChampions = new Set([
    ...draft.allies.map(({ championKey }) => championKey),
    ...draft.enemies.map(({ championKey }) => championKey),
  ]);
  const result = freeRoles.map((role) => ({ role, suggestions: [] as DraftSuggestion[] }));
  if (topN === 0) return result;

  for (const championKey of matrix.championKeys) {
    if (usedChampions.has(championKey)) continue;
    for (const group of result) {
      const pick = { championKey, role: group.role };
      const analysis = analyzeDraft(matrix, {
        allies: [...draft.allies, pick],
        enemies: draft.enemies,
      }, risk);
      addToTop(group.suggestions, {
        ...pick,
        winrate: analysis.winrate,
        analysis,
      }, topN);
    }
  }

  return result;
}
