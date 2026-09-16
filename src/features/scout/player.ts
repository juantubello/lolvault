import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';

import {
  OPGG_REGION,
  OPGG_SCOUT_REGIONS,
  type OpggScoutRegion,
} from '@/config';
import type { Db } from '@/db/client';
import { users } from '@/db/schema';
import {
  errorKind,
  loadPlayerStats,
  matchProviderErrorMessage,
  type AfterScheduler,
  type PlayerStats,
  type StatsUser,
} from '@/features/matches/player-stats';
import {
  isMatchProviderError,
  type MatchProvider,
  type RiotId,
  type SummonerProfile,
} from '@/features/matches/types';
import { riotIdKey } from '@/features/blacklist/blacklist-rules';
import { parseRiotId, RIOT_ID_ERROR } from '@/features/profile/profile-form';

const SCOUT_CACHE_PREFIX = 'scout-cache:';
const SCOUT_CACHE_EMAIL = 'scout-cache@invalid.local';

export type ScoutPlayer = StatsUser & { displayName: string; region: OpggScoutRegion };
type LoadedPlayerStats = Extract<PlayerStats, { status: 'ok' }>;

export type ScoutPlayerStatsResult =
  | { status: 'loaded'; player: ScoutPlayer; stats: LoadedPlayerStats }
  | { status: 'not-found' }
  | { status: 'error'; error: string };

function cacheIdentity(riotId: RiotId, region: OpggScoutRegion): string {
  const digest = createHash('sha256').update(`${region}:${riotIdKey(riotId)}`).digest('hex');
  return `${SCOUT_CACHE_PREFIX}${region.toLocaleLowerCase('en-US')}:${digest}`;
}

function legacyCacheIdentity(riotId: RiotId): string {
  const digest = createHash('sha256').update(riotIdKey(riotId)).digest('hex');
  return `${SCOUT_CACHE_PREFIX}${digest}`;
}

export function parseScoutRegion(value: string | undefined): OpggScoutRegion {
  const normalized = value?.trim().toLocaleUpperCase('en-US');
  return OPGG_SCOUT_REGIONS.find((region) => region === normalized) ?? OPGG_REGION;
}

export function parseScoutRiotId(value: string):
  | { ok: true; riotId: RiotId; text: string }
  | { ok: false; error: string } {
  const riotId = parseRiotId(value);
  if (!riotId) return { ok: false, error: RIOT_ID_ERROR };
  return { ok: true, riotId, text: `${riotId.gameName}#${riotId.tagLine}` };
}

function findScoutPlayer(
  db: Db,
  riotId: RiotId,
  region: OpggScoutRegion,
): ScoutPlayer | null {
  const key = riotIdKey(riotId);
  const existing = db
    .select()
    .from(users)
    .all()
    .find((user) =>
      user.riotGameName
      && user.riotTagLine
      && riotIdKey({ gameName: user.riotGameName, tagLine: user.riotTagLine }) === key
      && (
        user.externalIdentity === cacheIdentity(riotId, region)
        || (
          region === OPGG_REGION
          && (
            user.externalIdentity === legacyCacheIdentity(riotId)
            || !user.externalIdentity.startsWith(SCOUT_CACHE_PREFIX)
          )
        )
      ),
    );

  if (existing) {
    return {
      id: existing.id,
      displayName: existing.displayName ?? riotId.gameName,
      riotGameName: existing.riotGameName,
      riotTagLine: existing.riotTagLine,
      region,
    };
  }
  return null;
}

/**
 * Reutiliza `users` como dueño de las filas de caché. Las filas Scout no tienen displayName:
 * no son miembros, no aparecen en Amigos y no cuentan como votantes.
 */
function createScoutPlayer(
  db: Db,
  riotId: RiotId,
  region: OpggScoutRegion,
  now: Date,
): ScoutPlayer {
  const externalIdentity = cacheIdentity(riotId, region);
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
    region,
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
    region: parseScoutRegion(
      row.externalIdentity.startsWith(SCOUT_CACHE_PREFIX)
        ? row.externalIdentity.slice(SCOUT_CACHE_PREFIX.length).split(':', 1)[0]
        : undefined,
    ),
  };
}

function withPrefetchedProfile(provider: MatchProvider, profile: SummonerProfile): MatchProvider {
  return {
    name: provider.name,
    listMatches: provider.listMatches.bind(provider),
    getMatchDetail: provider.getMatchDetail.bind(provider),
    getProfile: async () => profile,
  };
}

export async function loadScoutPlayerStats(
  db: Db,
  provider: MatchProvider,
  riotId: RiotId,
  region: OpggScoutRegion,
  now: Date,
  scheduleAfter?: AfterScheduler,
): Promise<ScoutPlayerStatsResult> {
  const cachedPlayer = findScoutPlayer(db, riotId, region);
  if (cachedPlayer) {
    const stats = await loadPlayerStats(db, provider, cachedPlayer, now, scheduleAfter);
    return stats.status === 'ok'
      ? { status: 'loaded', player: cachedPlayer, stats }
      : { status: 'error', error: 'Ese jugador no tiene un Riot ID guardado.' };
  }

  let profile: SummonerProfile;
  try {
    profile = await provider.getProfile(riotId);
  } catch (error) {
    const kind = errorKind(error);
    if (!isMatchProviderError(error)) {
      console.error('[scout] Error inesperado confirmando el Riot ID:', error);
    }
    return kind === 'not-found'
      ? { status: 'not-found' }
      : { status: 'error', error: matchProviderErrorMessage(kind) };
  }

  // Recién después de que la fuente reconoce el Riot ID creamos el dueño de las filas de caché.
  const player = createScoutPlayer(db, riotId, region, now);
  const stats = await loadPlayerStats(
    db,
    withPrefetchedProfile(provider, profile),
    player,
    now,
    scheduleAfter,
  );
  return stats.status === 'ok'
    ? { status: 'loaded', player, stats }
    : { status: 'error', error: 'Ese jugador no tiene un Riot ID guardado.' };
}
