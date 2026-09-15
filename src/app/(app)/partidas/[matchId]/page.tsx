import { and, eq, isNotNull } from 'drizzle-orm';
import { Gamepad2 } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { EmptyState } from '@/components/empty-state';
import { MatchDetailView } from '@/components/matches/match-detail-view';
import { Screen } from '@/components/screen';
import { getDb, type Db } from '@/db/client';
import { matchDetails, playerMatches, vaultProposals } from '@/db/schema';
import { championImagesByKey } from '@/features/champions/champion-images';
import { getFriendProfile, listFriendProfiles } from '@/features/friends/friends.queries';
import { matchBackHref } from '@/features/matches/match-detail';
import { loadMatchDetail } from '@/features/matches/player-stats';
import { getMatchProvider } from '@/features/matches/provider';
import type { MatchDetail } from '@/features/matches/types';

export const dynamic = 'force-dynamic';

type PageSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function resolveDetail(
  db: Db,
  matchId: string,
  player: { id: number; riotGameName: string | null; riotTagLine: string | null },
): Promise<{ detail: MatchDetail | null; historyMatchFound: boolean }> {
  const historyMatch = db
    .select({ playedAt: playerMatches.playedAt })
    .from(playerMatches)
    .where(and(eq(playerMatches.userId, player.id), eq(playerMatches.matchId, matchId)))
    .get();

  if (historyMatch && player.riotGameName && player.riotTagLine) {
    const detail = await loadMatchDetail(
      db,
      getMatchProvider(),
      { matchId, playedAt: historyMatch.playedAt },
      { gameName: player.riotGameName, tagLine: player.riotTagLine },
      new Date(),
    );
    if (detail) return { detail, historyMatchFound: true };
  }

  const cached = db
    .select({ data: matchDetails.data })
    .from(matchDetails)
    .where(eq(matchDetails.matchId, matchId))
    .get();
  if (cached) return { detail: cached.data, historyMatchFound: Boolean(historyMatch) };

  const proposal = db
    .select({ snapshot: vaultProposals.matchSnapshot })
    .from(vaultProposals)
    .where(and(eq(vaultProposals.matchId, matchId), isNotNull(vaultProposals.matchSnapshot)))
    .get();
  if (proposal?.snapshot) return { detail: proposal.snapshot, historyMatchFound: Boolean(historyMatch) };

  return { detail: null, historyMatchFound: Boolean(historyMatch) };
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.displayName) redirect('/onboarding');

  const [{ matchId: rawMatchId }, query] = await Promise.all([params, searchParams]);
  // Los ids de OP.GG son base64 (terminan en "="): el segmento llega codificado ("%3D").
  const matchId = safeDecode(rawMatchId);
  const playerId = Number(first(query.jugador));
  if (!matchId || !Number.isInteger(playerId) || playerId <= 0) notFound();

  const db = getDb();
  const player = getFriendProfile(db, playerId);
  if (!player) notFound();

  const fromVoting = first(query.desde) === 'votaciones';
  const backHref = matchBackHref(currentUser.id, player.id, fromVoting);
  const backLabel = fromVoting ? 'Votaciones' : player.id === currentUser.id ? 'Perfil' : player.displayName;
  const resolved = await resolveDetail(db, matchId, player);
  if (!resolved.detail && !resolved.historyMatchFound) notFound();

  return (
    <Screen
      back={{ href: backHref, label: backLabel }}
      title="Detalle de partida"
    >
      {resolved.detail ? (
        <MatchDetailView
          championImages={championImagesByKey(db)}
          currentUserId={currentUser.id}
          detail={resolved.detail}
          focusUser={player}
          members={listFriendProfiles(db)}
        />
      ) : (
        <EmptyState
          description="OP.GG no respondió y todavía no tenemos el detalle guardado. Probá de nuevo en unos minutos."
          icon={Gamepad2}
          title="No pudimos cargar la partida"
        />
      )}
    </Screen>
  );
}
