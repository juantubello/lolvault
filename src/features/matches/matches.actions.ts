'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';
import { championImagesByKey } from '@/features/champions/champion-images';
import { getFriendProfile } from '@/features/friends/friends.queries';

import { toMatchOptions, type MatchOption } from './match-options';
import { loadPlayerStats, refreshPlayerStats } from './player-stats';
import { getMatchProvider } from '@/features/matches/provider';

export type ProposalMatchesResult = {
  status: 'ok' | 'no-riot-id' | 'error';
  matches: MatchOption[];
  /** Aviso para mostrar (sin Riot ID, OP.GG caído, etc.). */
  message: string | null;
};

export type RefreshPlayerStatsActionResult = { ok: true } | { ok: false; error: string };

/** Fuerza el historial de un miembro, autorizado exclusivamente por la sesión actual. */
export async function refreshPlayerStatsAction(userId: unknown): Promise<RefreshPlayerStatsActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer?.displayName) return { ok: false, error: 'No pudimos verificar tu sesión.' };

  const targetUserId = typeof userId === 'number' && Number.isSafeInteger(userId) ? userId : null;
  const db = getDb();
  const target = targetUserId !== null ? getFriendProfile(db, targetUserId) : null;
  if (!target) return { ok: false, error: 'Ese jugador no es del grupo.' };

  const result = await refreshPlayerStats(db, getMatchProvider(), target, new Date());
  if (!result.ok) return result;

  if (target.id === viewer.id) {
    revalidatePath('/perfil');
  } else {
    revalidatePath('/amigos/[id]', 'page');
  }
  return { ok: true };
}

/** Últimas partidas de un jugador del grupo, para elegir la decisiva al proponer un vault. */
export async function loadProposalMatchesAction(targetUserId: number): Promise<ProposalMatchesResult> {
  const viewer = await getCurrentUser();
  if (!viewer?.displayName) return { status: 'error', matches: [], message: 'No pudimos verificar tu sesión.' };

  const db = getDb();
  const target = Number.isInteger(targetUserId) ? getFriendProfile(db, targetUserId) : null;
  if (!target) return { status: 'error', matches: [], message: 'Ese jugador no es del grupo.' };

  const now = new Date();
  const stats = await loadPlayerStats(db, getMatchProvider(), target, now);
  if (stats.status === 'no-riot-id') {
    return { status: 'no-riot-id', matches: [], message: `${target.displayName} no cargó su Riot ID.` };
  }

  return {
    status: 'ok',
    matches: toMatchOptions(stats.matches, championImagesByKey(db), now),
    message: stats.error,
  };
}
