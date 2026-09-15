'use server';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';
import { championImagesByKey } from '@/features/champions/champion-images';
import { getFriendProfile } from '@/features/friends/friends.queries';

import { toMatchOptions, type MatchOption } from './match-options';
import { loadPlayerStats } from './player-stats';
import { getMatchProvider } from './provider';

export type ProposalMatchesResult = {
  status: 'ok' | 'no-riot-id' | 'error';
  matches: MatchOption[];
  /** Aviso para mostrar (sin Riot ID, OP.GG caído, etc.). */
  message: string | null;
};

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
