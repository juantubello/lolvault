'use server';

import { eq } from 'drizzle-orm';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';
import { playerStatsSync } from '@/db/schema';
import { DRAFT_PRIOR_GAMES, type DraftPick, type DraftRisk } from '@/features/draft/analysis';
import { getDraftMatrix } from '@/features/draft/matrix-cache';
import { createLiveCaptureToken } from '@/features/scout/live-capture';
import { getLiveGameProvider, hasLiveGameProvider, liveGameToDraft } from '@/features/scout/live-game';
import { liveDraftErrorState, type LiveDraftActionState } from '@/features/scout/live-game-state';
import { isSpectatorClientError } from '@/features/scout/spectator-client';

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function serializePicks(picks: readonly DraftPick[]): string {
  return picks.map((pick) => `${pick.championKey}-${pick.role}`).join(',');
}

function resultHref(
  allies: readonly DraftPick[],
  enemies: readonly DraftPick[],
  captureToken: string,
  risk: string,
  players: string,
): string {
  const query = new URLSearchParams({
    tipo: 'draft',
    aliados: serializePicks(allies),
    enemigos: serializePicks(enemies),
    captura: captureToken,
  });
  if (Object.hasOwn(DRAFT_PRIOR_GAMES, risk) && risk !== 'medium') {
    query.set('riesgo', risk as DraftRisk);
  }
  if (players) query.set('jugadores', players);
  return `/scout?${query.toString()}`;
}

export async function loadLiveDraftAction(
  _previousState: LiveDraftActionState,
  formData: FormData,
): Promise<LiveDraftActionState> {
  const user = await getCurrentUser();
  if (!user?.displayName) {
    return { status: 'error', message: 'Tu sesión venció. Recargá la página para volver a entrar.' };
  }
  if (!hasLiveGameProvider()) {
    return {
      status: 'unconfigured',
      message: 'La API de Riot no está configurada. Podés seguir cargando el draft a mano.',
    };
  }
  if (!user.riotGameName || !user.riotTagLine) {
    return {
      status: 'no-riot-id',
      message: 'No cargaste tu Riot ID. Agregalo en Perfil para buscar tu partida.',
    };
  }

  const db = getDb();
  const cached = db.select({ puuid: playerStatsSync.puuid })
    .from(playerStatsSync)
    .where(eq(playerStatsSync.userId, user.id))
    .get();
  const puuid = cached?.puuid ?? user.riotPuuid;
  if (!puuid) {
    return {
      status: 'missing-puuid',
      message: 'Tu Riot ID está cargado, pero todavía no tenemos su PUUID. Actualizá tus partidas desde Perfil y probá de nuevo.',
    };
  }

  const matrix = getDraftMatrix(db);
  if (!matrix) {
    return { status: 'error', message: 'Todavía no hay una matriz de Draft lista para inferir los roles.' };
  }

  try {
    const game = await getLiveGameProvider().getLiveGame(puuid);
    if (!game) {
      return {
        status: 'unconfigured',
        message: 'La API de Riot no está configurada. Podés seguir cargando el draft a mano.',
      };
    }
    const knownChampions = new Set(matrix.championKeys);
    if (game.participants.some((participant) => !knownChampions.has(participant.championId))) {
      return {
        status: 'error',
        message: 'La partida tiene un campeón que todavía no está en el caché. Actualizá Data Dragon y probá de nuevo.',
      };
    }
    const draft = liveGameToDraft(game, puuid, matrix);
    const apiKey = process.env.RIOT_API_KEY?.trim() ?? '';
    const captureToken = createLiveCaptureToken({
      userId: user.id,
      gameId: game.gameId,
      gameStartTime: game.gameStartTime,
      capturedAt: Date.now(),
    }, apiKey);
    return {
      status: 'loaded',
      href: resultHref(
        draft.allies,
        draft.enemies,
        captureToken,
        textValue(formData, 'riesgo'),
        textValue(formData, 'jugadores'),
      ),
    };
  } catch (error) {
    if (!isSpectatorClientError(error)) {
      console.error('[spectator] Error inesperado trayendo la partida en vivo:', error);
    }
    return liveDraftErrorState(error);
  }
}
