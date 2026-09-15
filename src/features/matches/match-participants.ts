import type { Db } from '@/db/client';
import { matchDetails, matchParticipants } from '@/db/schema';
import { normalizeBlacklistName } from '@/features/blacklist/blacklist-rules';

import type { MatchDetail } from './types';

/** Indexa los diez jugadores de un detalle. Es idempotente y actualiza nombres renombrados. */
export function indexMatchParticipants(db: Db, provider: string, detail: MatchDetail): void {
  const playedAt = new Date(detail.playedAt);
  const validPlayedAt = Number.isNaN(playedAt.getTime()) ? null : playedAt;

  db.transaction((tx) => {
    for (const team of detail.teams) {
      for (const participant of team.participants) {
        const row = {
          provider,
          matchId: detail.matchId,
          puuid: participant.puuid,
          gameName: participant.gameName,
          tagLine: participant.tagLine,
          searchName: normalizeBlacklistName(participant.gameName),
          championId: participant.championId,
          championName: participant.championName,
          teamKey: participant.teamKey || team.key,
          playedAt: validPlayedAt,
        };
        tx.insert(matchParticipants)
          .values(row)
          .onConflictDoUpdate({
            target: [matchParticipants.provider, matchParticipants.matchId, matchParticipants.puuid],
            set: row,
          })
          .run();
      }
    }
  });
}

/** Reconstruye el índice desde snapshots permanentes ya cacheados. Seguro para cada arranque. */
export function backfillMatchParticipants(db: Db): number {
  const details = db.select().from(matchDetails).all();
  for (const row of details) indexMatchParticipants(db, row.provider, row.data);
  return details.length;
}
