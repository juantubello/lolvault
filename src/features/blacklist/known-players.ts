import { eq, isNotNull } from 'drizzle-orm';

import { BLACKLIST_SUGGESTIONS_LIMIT } from '@/config';
import type { Db } from '@/db/client';
import { matchDetails, matchParticipants, playerMatches, users } from '@/db/schema';
import type { MatchParticipant, RiotId } from '@/features/matches/types';

import { normalizeBlacklistName, riotIdKey } from './blacklist-rules';

export type KnownPlayerMember = { id: number; displayName: string };

export type KnownPlayerSuggestion = {
  riotId: RiotId;
  riotIdText: string;
  sharedMatches: number;
  lastPlayedAt: Date;
  members: KnownPlayerMember[];
};

type MatchKey = `${string}\u0000${string}`;

function matchKey(provider: string, matchId: string): MatchKey {
  return `${provider}\u0000${matchId}`;
}

function memberRiotIds(db: Db): Set<string> {
  return new Set(
    db
      .select({ gameName: users.riotGameName, tagLine: users.riotTagLine })
      .from(users)
      .where(isNotNull(users.displayName))
      .all()
      .flatMap(({ gameName, tagLine }) =>
        gameName && tagLine ? [riotIdKey({ gameName, tagLine })] : [],
      ),
  );
}

function membersByMatch(db: Db): Map<MatchKey, Map<number, KnownPlayerMember>> {
  const rows = db
    .select({
      provider: playerMatches.provider,
      matchId: playerMatches.matchId,
      id: users.id,
      displayName: users.displayName,
    })
    .from(playerMatches)
    .innerJoin(users, eq(users.id, playerMatches.userId))
    .where(isNotNull(users.displayName))
    .all();

  const result = new Map<MatchKey, Map<number, KnownPlayerMember>>();
  for (const row of rows) {
    if (!row.displayName) continue;
    const key = matchKey(row.provider, row.matchId);
    const members = result.get(key) ?? new Map<number, KnownPlayerMember>();
    members.set(row.id, { id: row.id, displayName: row.displayName });
    result.set(key, members);
  }
  return result;
}

/** Autocompletado sobre jugadores vistos; compara miembros por Riot ID, nunca por puuid. */
export function searchKnownPlayers(db: Db, query: string, _now: Date): KnownPlayerSuggestion[] {
  const normalized = normalizeBlacklistName(query);
  if (normalized.length < 2) return [];

  const members = memberRiotIds(db);
  const sharedMembers = membersByMatch(db);
  const groups = new Map<
    string,
    {
      riotId: RiotId;
      matches: Set<MatchKey>;
      lastPlayedAt: Date;
      members: Map<number, KnownPlayerMember>;
    }
  >();

  const rows = db.select().from(matchParticipants).all();
  for (const row of rows) {
    if (!row.searchName.includes(normalized)) continue;
    const idKey = riotIdKey({ gameName: row.gameName, tagLine: row.tagLine });
    if (members.has(idKey)) continue;

    const playedAt = row.playedAt ?? new Date(0);
    const current = groups.get(idKey) ?? {
      riotId: { gameName: row.gameName, tagLine: row.tagLine },
      matches: new Set<MatchKey>(),
      lastPlayedAt: playedAt,
      members: new Map<number, KnownPlayerMember>(),
    };
    const key = matchKey(row.provider, row.matchId);
    current.matches.add(key);
    if (playedAt > current.lastPlayedAt) {
      current.lastPlayedAt = playedAt;
      current.riotId = { gameName: row.gameName, tagLine: row.tagLine };
    }
    for (const member of sharedMembers.get(key)?.values() ?? []) {
      current.members.set(member.id, member);
    }
    groups.set(idKey, current);
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime() || b.matches.size - a.matches.size,
    )
    .slice(0, BLACKLIST_SUGGESTIONS_LIMIT)
    .map((group) => ({
      riotId: group.riotId,
      riotIdText: `${group.riotId.gameName}#${group.riotId.tagLine}`,
      sharedMatches: group.matches.size,
      lastPlayedAt: group.lastPlayedAt,
      members: [...group.members.values()].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'es'),
      ),
    }));
}

export type KnownPlayerMatch = {
  provider: string;
  matchId: string;
  playedAt: Date;
  queue: string;
  championId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  result: string;
  members: KnownPlayerMember[];
};

function sameRiotId(participant: MatchParticipant, riotId: RiotId): boolean {
  return riotIdKey(participant) === riotIdKey(riotId);
}

/** Partidas cacheadas donde apareció el Riot ID y qué miembros compartieron esa partida. */
export function listMatchesWithPlayer(db: Db, riotId: RiotId): KnownPlayerMatch[] {
  const matchingKeys = new Set(
    db
      .select()
      .from(matchParticipants)
      .all()
      .filter((row) => riotIdKey(row) === riotIdKey(riotId))
      .map((row) => matchKey(row.provider, row.matchId)),
  );
  if (matchingKeys.size === 0) return [];

  const sharedMembers = membersByMatch(db);
  const result: KnownPlayerMatch[] = [];
  for (const row of db.select().from(matchDetails).all()) {
    const key = matchKey(row.provider, row.matchId);
    if (!matchingKeys.has(key)) continue;
    const participant = row.data.teams
      .flatMap((team) => team.participants)
      .find((candidate) => sameRiotId(candidate, riotId));
    if (!participant) continue;

    result.push({
      provider: row.provider,
      matchId: row.matchId,
      playedAt: row.playedAt,
      queue: row.data.queue,
      championId: participant.championId,
      championName: participant.championName,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      result: participant.result,
      members: [...(sharedMembers.get(key)?.values() ?? [])].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'es'),
      ),
    });
  }

  return result.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}
