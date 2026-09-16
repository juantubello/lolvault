import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { users } from '@/db/schema';
import {
  loadPlayerStats,
  type AfterScheduler,
  type PlayerStats,
  type StatsUser,
} from '@/features/matches/player-stats';
import type { MatchProvider, RiotId } from '@/features/matches/types';
import { riotIdKey } from '@/features/blacklist/blacklist-rules';
import { parseRiotId, RIOT_ID_ERROR } from '@/features/profile/profile-form';

const SCOUT_CACHE_PREFIX = 'scout-cache:';
const SCOUT_CACHE_EMAIL = 'scout-cache@invalid.local';

export type ScoutPlayer = StatsUser & { displayName: string };

function cacheIdentity(riotId: RiotId): string {
  const digest = createHash('sha256').update(riotIdKey(riotId)).digest('hex');
  return `${SCOUT_CACHE_PREFIX}${digest}`;
}

export function parseScoutRiotId(value: string):
  | { ok: true; riotId: RiotId; text: string }
  | { ok: false; error: string } {
  const riotId = parseRiotId(value);
  if (!riotId) return { ok: false, error: RIOT_ID_ERROR };
  return { ok: true, riotId, text: `${riotId.gameName}#${riotId.tagLine}` };
}

/**
 * Reutiliza `users` como dueño de las filas de caché. Las filas Scout no tienen displayName:
 * no son miembros, no aparecen en Amigos y no cuentan como votantes.
 */
export function findOrCreateScoutPlayer(db: Db, riotId: RiotId, now: Date): ScoutPlayer {
  const key = riotIdKey(riotId);
  const existing = db
    .select()
    .from(users)
    .all()
    .find((user) =>
      user.riotGameName && user.riotTagLine
        ? riotIdKey({ gameName: user.riotGameName, tagLine: user.riotTagLine }) === key
        : false,
    );

  if (existing) {
    return {
      id: existing.id,
      displayName: existing.displayName ?? riotId.gameName,
      riotGameName: existing.riotGameName,
      riotTagLine: existing.riotTagLine,
    };
  }

  const externalIdentity = cacheIdentity(riotId);
  db
    .insert(users)
    .values({
      externalIdentity,
      email: SCOUT_CACHE_EMAIL,
      displayName: null,
      riotGameName: riotId.gameName,
      riotTagLine: riotId.tagLine,
      createdAt: now,
    })
    .onConflictDoNothing({ target: users.externalIdentity })
    .run();
  const row = db.select().from(users).where(eq(users.externalIdentity, externalIdentity)).get();
  if (!row) throw new Error('No se pudo crear la entrada de caché para Scout.');

  return {
    id: row.id,
    displayName: riotId.gameName,
    riotGameName: row.riotGameName,
    riotTagLine: row.riotTagLine,
  };
}

export function getScoutPlayer(db: Db, id: number): ScoutPlayer | null {
  const row = db.select().from(users).where(eq(users.id, id)).get();
  if (!row?.riotGameName || !row.riotTagLine) return null;
  return {
    id: row.id,
    displayName: row.displayName ?? row.riotGameName,
    riotGameName: row.riotGameName,
    riotTagLine: row.riotTagLine,
  };
}

export async function loadScoutPlayerStats(
  db: Db,
  provider: MatchProvider,
  riotId: RiotId,
  now: Date,
  scheduleAfter?: AfterScheduler,
): Promise<{ player: ScoutPlayer; stats: PlayerStats }> {
  const player = findOrCreateScoutPlayer(db, riotId, now);
  const stats = await loadPlayerStats(db, provider, player, now, scheduleAfter);
  return { player, stats };
}
