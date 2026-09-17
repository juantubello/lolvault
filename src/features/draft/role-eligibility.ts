import {
  analyzeChampion,
  type DraftMatrix,
  type DraftRisk,
} from '@/features/draft/analysis';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';

/** Mínimos para considerar que un campeón juega un rol. Medidos sobre la matriz: §1.5.3 del plan. */
export const DRAFT_ROLE_MIN_GAMES = 1_000;
export const DRAFT_ROLE_MIN_SHARE = 0.02;

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
