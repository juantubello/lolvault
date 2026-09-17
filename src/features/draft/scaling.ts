import {
  DRAFT_PRIOR_GAMES,
  ratingToWinrate,
  winrateToRating,
  type Draft,
  type DraftPick,
  type DraftRisk,
} from '@/features/draft/analysis';
import type { DraftRole } from '@/features/draft/types';

export type DraftScalingRow = DraftPick & {
  bucket: number;
  games: number;
  wins: number;
};

export type DraftScalingMatrix = ReadonlyMap<string, readonly DraftScalingRow[]>;

export type DraftScalingPoint = {
  bucket: number;
  winrate: number;
};

export type DraftScalingCurves = {
  allies: DraftScalingPoint[];
  enemies: DraftScalingPoint[];
};

function pickKey(pick: DraftPick): string {
  return `${pick.championKey}:${pick.role}`;
}

export function buildDraftScalingMatrix(rows: readonly DraftScalingRow[]): DraftScalingMatrix {
  const matrix = new Map<string, DraftScalingRow[]>();
  for (const row of rows) {
    const key = pickKey(row);
    const current = matrix.get(key) ?? [];
    current.push(row);
    matrix.set(key, current);
  }
  for (const series of matrix.values()) series.sort((a, b) => a.bucket - b.bucket);
  return matrix;
}

function validWinrate(wins: number, games: number): number | null {
  if (games <= 0 || wins <= 0 || wins >= games) return null;
  return wins / games;
}

/**
 * Curva normalizada de un lado, independiente de la del rival. Cada bucket se encoge hacia el
 * win rate general de ese mismo campeón y aporta sólo su diferencia en escala Elo.
 *
 * El promedio de referencia sale de la PROPIA serie, no de `championStats`: son dos endpoints
 * distintos de Lolalytics y no coinciden exactamente (para ahri/middle, 52,78 % contra 52,79 %).
 * Tomarlo de afuera mete un sesgo constante por campeón —medido: hasta 0,21 puntos sobre la curva
 * de un equipo— y rompe la propiedad que la pantalla promete, que 50 % sea exactamente "rindió
 * como su promedio". Con la serie como referencia, eso vale por construcción.
 */
export function calculateTeamScalingCurve(
  scalingMatrix: DraftScalingMatrix,
  picks: readonly DraftPick[],
  risk: DraftRisk = 'medium',
): DraftScalingPoint[] | null {
  if (picks.length === 0) {
    return Array.from({ length: 7 }, (_, index) => ({ bucket: index + 1, winrate: 0.5 }));
  }

  const champions = picks.map((pick) => {
    const series = scalingMatrix.get(pickKey(pick));
    if (!series || series.length !== 7) return null;
    const generalWinrate = validWinrate(
      series.reduce((total, current) => total + current.wins, 0),
      series.reduce((total, current) => total + current.games, 0),
    );
    if (generalWinrate === null) return null;
    const byBucket = new Map(series.map((row) => [row.bucket, row]));
    if (Array.from({ length: 7 }, (_, index) => index + 1).some((bucket) => !byBucket.has(bucket))) {
      return null;
    }
    return { generalWinrate, byBucket };
  });
  if (champions.some((champion) => champion === null)) return null;

  const prior = DRAFT_PRIOR_GAMES[risk];
  const points: DraftScalingPoint[] = [];
  for (let index = 0; index < 7; index += 1) {
    const bucket = index + 1;
    let rating = 0;
    for (const champion of champions) {
      if (!champion) return null;
      const stats = champion.byBucket.get(bucket);
      if (!stats || stats.games <= 0) return null;
      const adjusted = (stats.wins + prior * champion.generalWinrate) / (stats.games + prior);
      if (adjusted <= 0 || adjusted >= 1) return null;
      rating += winrateToRating(adjusted) - winrateToRating(champion.generalWinrate);
    }
    points.push({ bucket, winrate: ratingToWinrate(rating) });
  }
  return points;
}

export function calculateDraftScalingCurves(
  scalingMatrix: DraftScalingMatrix,
  draft: Draft,
  risk: DraftRisk = 'medium',
): DraftScalingCurves | null {
  const allies = calculateTeamScalingCurve(scalingMatrix, draft.allies, risk);
  const enemies = calculateTeamScalingCurve(scalingMatrix, draft.enemies, risk);
  return allies && enemies ? { allies, enemies } : null;
}

export function scalingRowsFromDb(rows: readonly {
  championKey: number;
  role: string;
  bucket: number;
  games: number;
  wins: number;
}[]): DraftScalingRow[] {
  return rows.map((row) => ({ ...row, role: row.role as DraftRole }));
}
