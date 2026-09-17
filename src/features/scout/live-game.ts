import { RIOT_PLATFORM } from '@/config';
import type { Draft, DraftMatrix, DraftPick } from '@/features/draft/analysis';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';
import {
  createSpectatorClient,
  type SpectatorGame,
} from '@/features/scout/spectator-client';

export type LiveGame = SpectatorGame;

export interface LiveGameProvider {
  getLiveGame(puuid: string): Promise<LiveGame | null>;
}

class UnavailableLiveGameProvider implements LiveGameProvider {
  async getLiveGame(_puuid: string): Promise<null> {
    return null;
  }
}

const unavailableProvider: LiveGameProvider = new UnavailableLiveGameProvider();
const globalForProvider = globalThis as unknown as {
  __lolvaultLiveGameProviders?: Map<string, LiveGameProvider>;
};

type RiotEnvironment = { RIOT_API_KEY?: string };

export function hasLiveGameProvider(env: RiotEnvironment = process.env as RiotEnvironment): boolean {
  return Boolean(env.RIOT_API_KEY?.trim());
}

export function getLiveGameProvider(env: RiotEnvironment = process.env as RiotEnvironment): LiveGameProvider {
  const apiKey = env.RIOT_API_KEY?.trim();
  if (!apiKey) return unavailableProvider;

  const providers = (globalForProvider.__lolvaultLiveGameProviders ??= new Map());
  const cacheKey = `${RIOT_PLATFORM}:${apiKey}`;
  let provider = providers.get(cacheKey);
  if (!provider) {
    const client = createSpectatorClient({ apiKey, platform: RIOT_PLATFORM });
    provider = { getLiveGame: (puuid: string) => client.getActiveGame(puuid) };
    providers.set(cacheKey, provider);
  }
  return provider;
}

function roleGames(matrix: DraftMatrix, championKey: number, role: DraftRole): number {
  return matrix.championStats.get(`${championKey}:${role}`)?.games ?? 0;
}

/**
 * Spectator-v5 no informa carriles. Recorremos las 5! asignaciones posibles y elegimos la que
 * maximiza las partidas observadas de cada campeón en el rol asignado.
 */
export function inferTeamRoles(
  championKeys: readonly number[],
  matrix: DraftMatrix,
): DraftPick[] {
  if (championKeys.length !== DRAFT_ROLES.length || new Set(championKeys).size !== DRAFT_ROLES.length) {
    throw new Error('La inferencia necesita cinco campeones distintos.');
  }

  let best: DraftPick[] | null = null;
  let bestGames = -1;
  const used = new Set<DraftRole>();
  const current: DraftPick[] = [];

  function visit(index: number, totalGames: number): void {
    if (index === championKeys.length) {
      if (totalGames > bestGames) {
        bestGames = totalGames;
        best = current.map((pick) => ({ ...pick }));
      }
      return;
    }
    const championKey = championKeys[index];
    if (championKey === undefined) return;
    for (const role of DRAFT_ROLES) {
      if (used.has(role)) continue;
      used.add(role);
      current.push({ championKey, role });
      visit(index + 1, totalGames + roleGames(matrix, championKey, role));
      current.pop();
      used.delete(role);
    }
  }

  visit(0, 0);
  return best ?? [];
}

/** Deriva los lados por el PUUID del usuario; el orden/teamId de Riot nunca decide quién es aliado. */
export function liveGameToDraft(game: LiveGame, ownPuuid: string, matrix: DraftMatrix): Draft {
  const ownParticipant = game.participants.find((participant) => participant.puuid === ownPuuid);
  if (!ownParticipant) throw new Error('Tu PUUID no aparece entre los participantes de Riot.');

  const allies = game.participants.filter((participant) => participant.teamId === ownParticipant.teamId);
  const enemies = game.participants.filter((participant) => participant.teamId !== ownParticipant.teamId);
  const teamIds = new Set(game.participants.map((participant) => participant.teamId));
  if (game.participants.length !== 10 || teamIds.size !== 2 || allies.length !== 5 || enemies.length !== 5) {
    throw new Error('Riot no devolvió dos equipos completos de cinco jugadores.');
  }

  return {
    allies: inferTeamRoles(allies.map((participant) => participant.championId), matrix),
    enemies: inferTeamRoles(enemies.map((participant) => participant.championId), matrix),
  };
}
