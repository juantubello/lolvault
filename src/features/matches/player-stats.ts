/**
 * Historial y perfil de un jugador con caché en la base. La fuente (OP.GG) se consulta como mucho
 * cada MATCHES_REFRESH_MS; si falla, se espera MATCHES_RETRY_AFTER_ERROR_MS y mientras tanto se
 * muestra lo guardado. Nunca tira errores de la fuente hacia la UI: los devuelve como estado.
 */
import { and, desc, eq } from 'drizzle-orm';
import { after } from 'next/server';

import {
  MATCH_DETAILS_PER_SYNC,
  MATCHES_FORCE_REFRESH_MS,
  MATCHES_LIMIT,
  MATCHES_REFRESH_MS,
  MATCHES_RETRY_AFTER_ERROR_MS,
} from '@/config';
import type { Db } from '@/db/client';
import { matchDetails, playerMatches, playerStatsSync } from '@/db/schema';

import {
  isMatchProviderError,
  type MatchDetail,
  type MatchProvider,
  type MatchProviderError,
  type PlayerMatchSummary,
  type RiotId,
  type SummonerProfile,
} from '@/features/matches/types';
import { indexMatchParticipants } from '@/features/matches/match-participants';

export type PlayerStats =
  | { status: 'no-riot-id' }
  | {
      status: 'ok';
      riotId: RiotId;
      matches: PlayerMatchSummary[];
      /** Snapshots completos cacheados para referencias y comparaciones; nunca dispara red. */
      details: MatchDetail[];
      profile: SummonerProfile | null;
      /** Última sincronización exitosa del historial. */
      syncedAt: Date | null;
      /** Mensaje para mostrar si el último intento falló (se muestran datos guardados). */
      error: string | null;
      notFound: boolean;
    };

export type StatsUser = { id: number; riotGameName: string | null; riotTagLine: string | null };
export type AfterScheduler = (task: () => void | Promise<void>) => void;
export type RefreshPlayerStatsResult = { ok: true } | { ok: false; error: string };

export const FORCE_REFRESH_RATE_LIMIT_MESSAGE = 'Recién actualizamos; probá de nuevo en un minuto.';

const ERROR_MESSAGES: Record<MatchProviderError['kind'], string> = {
  'not-found': 'OP.GG no encuentra ese Riot ID. Revisá que esté bien escrito en el perfil.',
  unavailable: 'OP.GG no respondió. Mostramos los últimos datos guardados.',
  'invalid-response': 'OP.GG cambió su respuesta y no la pudimos leer. Mostramos los últimos datos guardados.',
};

export function matchProviderErrorMessage(kind: MatchProviderError['kind']): string {
  return ERROR_MESSAGES[kind] ?? ERROR_MESSAGES.unavailable;
}

function sameRiotId(sync: { riotGameName: string; riotTagLine: string }, riotId: RiotId): boolean {
  return (
    sync.riotGameName.toLocaleLowerCase('en-US') === riotId.gameName.toLocaleLowerCase('en-US') &&
    sync.riotTagLine.toLocaleLowerCase('en-US') === riotId.tagLine.toLocaleLowerCase('en-US')
  );
}

export function errorKind(error: unknown): MatchProviderError['kind'] {
  return isMatchProviderError(error) ? error.kind : 'unavailable';
}

/** Decide si toca consultar la fuente o alcanza con el caché. Pura, para testearla. */
export function shouldSync(
  sync: typeof playerStatsSync.$inferSelect | undefined,
  riotId: RiotId,
  now: Date,
): boolean {
  if (!sync || !sameRiotId(sync, riotId)) return true;
  if (!sync.attemptedAt) return true;

  const failedLastTime = sync.lastErrorAt !== null && sync.lastErrorAt.getTime() >= sync.attemptedAt.getTime();
  const wait = failedLastTime ? MATCHES_RETRY_AFTER_ERROR_MS : MATCHES_REFRESH_MS;
  return now.getTime() - sync.attemptedAt.getTime() >= wait;
}

function readCachedMatches(db: Db, userId: number, puuid: string | null): PlayerMatchSummary[] {
  if (!puuid) return [];
  return db
    .select()
    .from(playerMatches)
    .where(and(eq(playerMatches.userId, userId), eq(playerMatches.puuid, puuid)))
    .orderBy(desc(playerMatches.playedAt))
    .limit(MATCHES_LIMIT)
    .all();
}

function readCachedMatchDetails(db: Db, provider: string): MatchDetail[] {
  return db
    .select({ data: matchDetails.data })
    .from(matchDetails)
    .where(eq(matchDetails.provider, provider))
    .orderBy(desc(matchDetails.playedAt))
    .all()
    .map((row) => row.data);
}

async function sync(db: Db, provider: MatchProvider, userId: number, riotId: RiotId, now: Date) {
  // Marcar el intento antes de pedir: si llegan dos requests juntos, el segundo usa el caché.
  db.insert(playerStatsSync)
    .values({ userId, provider: provider.name, riotGameName: riotId.gameName, riotTagLine: riotId.tagLine, attemptedAt: now })
    .onConflictDoUpdate({
      target: playerStatsSync.userId,
      set: { provider: provider.name, riotGameName: riotId.gameName, riotTagLine: riotId.tagLine, attemptedAt: now },
    })
    .run();

  const [matchesResult, profileResult] = await Promise.allSettled([
    provider.listMatches(riotId, MATCHES_LIMIT),
    provider.getProfile(riotId),
  ]);

  db.transaction((tx) => {
    if (matchesResult.status === 'fulfilled') {
      for (const match of matchesResult.value) {
        const row = { ...match, userId, provider: provider.name, fetchedAt: now };
        tx.insert(playerMatches)
          .values(row)
          .onConflictDoUpdate({
            target: [playerMatches.userId, playerMatches.provider, playerMatches.matchId],
            set: row,
          })
          .run();
      }
    }

    const puuid =
      (profileResult.status === 'fulfilled' ? profileResult.value.puuid : undefined) ??
      (matchesResult.status === 'fulfilled' ? matchesResult.value[0]?.puuid : undefined);
    const failure = [matchesResult, profileResult].find((result) => result.status === 'rejected');

    tx.update(playerStatsSync)
      .set({
        ...(puuid ? { puuid } : {}),
        ...(matchesResult.status === 'fulfilled' ? { matchesSyncedAt: now } : {}),
        ...(profileResult.status === 'fulfilled' ? { profile: profileResult.value, profileSyncedAt: now } : {}),
        lastError: failure ? errorKind(failure.reason) : null,
        lastErrorAt: failure ? now : null,
      })
      .where(eq(playerStatsSync.userId, userId))
      .run();
  });

  for (const result of [matchesResult, profileResult]) {
    if (result.status === 'rejected' && !isMatchProviderError(result.reason)) {
      console.error('[matches] Error inesperado de la fuente:', result.reason);
    }
  }

  return matchesResult.status === 'fulfilled';
}

/**
 * Completa snapshots faltantes en orden reciente, de a uno. Es independiente de Next para que
 * tests y scripts puedan invocarla directamente.
 */
export async function hydrateMissingMatchDetails(
  db: Db,
  provider: MatchProvider,
  user: StatsUser,
  now: Date,
): Promise<number> {
  if (!user.riotGameName || !user.riotTagLine) return 0;

  const cachedIds = new Set(
    db
      .select({ matchId: matchDetails.matchId })
      .from(matchDetails)
      .where(eq(matchDetails.provider, provider.name))
      .all()
      .map((row) => row.matchId),
  );
  const missing = db
    .select({ matchId: playerMatches.matchId, playedAt: playerMatches.playedAt })
    .from(playerMatches)
    .where(and(eq(playerMatches.userId, user.id), eq(playerMatches.provider, provider.name)))
    .orderBy(desc(playerMatches.playedAt))
    .all()
    .filter((match) => !cachedIds.has(match.matchId))
    .slice(0, MATCH_DETAILS_PER_SYNC);

  let hydrated = 0;
  const focus = { gameName: user.riotGameName, tagLine: user.riotTagLine };
  for (const match of missing) {
    const detail = await loadMatchDetail(db, provider, match, focus, now);
    // Si la fuente cayó, no insistir con cuatro pedidos más en el mismo background task.
    if (!detail) break;
    hydrated += 1;
  }
  return hydrated;
}

export async function loadPlayerStats(
  db: Db,
  provider: MatchProvider,
  user: StatsUser,
  now: Date,
  scheduleAfter: AfterScheduler = after,
  options: { force?: boolean } = {},
): Promise<PlayerStats> {
  if (!user.riotGameName || !user.riotTagLine) return { status: 'no-riot-id' };
  const riotId = { gameName: user.riotGameName, tagLine: user.riotTagLine };

  const current = db.select().from(playerStatsSync).where(eq(playerStatsSync.userId, user.id)).get();
  let historySynced = false;
  if (options.force || shouldSync(current, riotId, now)) {
    historySynced = await sync(db, provider, user.id, riotId, now);
  }

  if (historySynced) {
    try {
      scheduleAfter(async () => {
        try {
          await hydrateMissingMatchDetails(db, provider, user, now);
        } catch (error) {
          // La hidratación es best-effort y nunca rompe la pantalla ni el sync ya persistido.
          if (!isMatchProviderError(error)) {
            console.error('[matches] Error inesperado hidratando detalles:', error);
          }
        }
      });
    } catch {
      // `after()` exige un request de Next; tests/scripts pueden inyectar su propio scheduler.
    }
  }

  const state = db.select().from(playerStatsSync).where(eq(playerStatsSync.userId, user.id)).get();
  const kind = state?.lastError as MatchProviderError['kind'] | null | undefined;

  return {
    status: 'ok',
    riotId,
    matches: readCachedMatches(db, user.id, state?.puuid ?? null),
    details: readCachedMatchDetails(db, provider.name),
    profile: state?.profile ?? null,
    syncedAt: state?.matchesSyncedAt ?? null,
    error: kind ? matchProviderErrorMessage(kind) : null,
    notFound: kind === 'not-found',
  };
}

/**
 * Refresco solicitado por una persona. Saltea las ventanas automáticas, pero limita los pedidos
 * manuales por jugador para no martillar a OP.GG desde varias pantallas o dispositivos.
 */
export async function refreshPlayerStats(
  db: Db,
  provider: MatchProvider,
  user: StatsUser,
  now: Date,
  scheduleAfter: AfterScheduler = after,
): Promise<RefreshPlayerStatsResult> {
  if (!user.riotGameName || !user.riotTagLine) {
    return { ok: false, error: 'Ese jugador todavía no cargó su Riot ID.' };
  }

  const current = db.select().from(playerStatsSync).where(eq(playerStatsSync.userId, user.id)).get();
  if (
    current?.attemptedAt &&
    now.getTime() - current.attemptedAt.getTime() < MATCHES_FORCE_REFRESH_MS
  ) {
    return { ok: false, error: FORCE_REFRESH_RATE_LIMIT_MESSAGE };
  }

  const stats = await loadPlayerStats(db, provider, user, now, scheduleAfter, { force: true });
  if (stats.status === 'no-riot-id') {
    return { ok: false, error: 'Ese jugador todavía no cargó su Riot ID.' };
  }
  return stats.error ? { ok: false, error: stats.error } : { ok: true };
}

/** Detalle de una partida: una vez guardado no se vuelve a pedir. Null si la fuente no responde. */
export async function loadMatchDetail(
  db: Db,
  provider: MatchProvider,
  match: { matchId: string; playedAt: Date },
  focus: RiotId,
  now: Date,
): Promise<MatchDetail | null> {
  const cached = db
    .select({ data: matchDetails.data })
    .from(matchDetails)
    .where(and(eq(matchDetails.provider, provider.name), eq(matchDetails.matchId, match.matchId)))
    .get();
  if (cached) return cached.data;

  try {
    const detail = await provider.getMatchDetail(match.matchId, match.playedAt, focus);
    db.insert(matchDetails)
      .values({ provider: provider.name, matchId: match.matchId, playedAt: match.playedAt, data: detail, fetchedAt: now })
      .onConflictDoNothing()
      .run();
    indexMatchParticipants(db, provider.name, detail);
    return detail;
  } catch (error) {
    if (isMatchProviderError(error)) return null;
    throw error;
  }
}
