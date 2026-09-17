import {
  DraftDataSourceError,
  isDraftDataSourceError,
  type DraftDataSource,
} from '@/features/draft/types';

import { createLolalyticsClient } from './lolalytics-client';
import {
  ChampionNotFoundError,
  parseCounterResponse,
  parseTeamResponse,
} from './lolalytics-parser';

function winsFrom(games: number, winRate: number): number {
  return Math.round(games * winRate / 100);
}

function invalidResponse(error: unknown): DraftDataSourceError {
  if (error instanceof ChampionNotFoundError) {
    return new DraftDataSourceError(error.message, 'not-found');
  }
  const detail = error instanceof Error ? `: ${error.message}` : '';
  return new DraftDataSourceError(`Respuesta de Lolalytics inválida${detail}`, 'invalid-response');
}

export function createLolalyticsProvider(options: {
  client?: Pick<ReturnType<typeof createLolalyticsClient>, 'getCounter' | 'getTeam'>;
} = {}): DraftDataSource {
  const client = options.client ?? createLolalyticsClient();

  return {
    name: 'lolalytics',

    async getMatchups(input) {
      try {
        const parsed = parseCounterResponse(await client.getCounter(input));
        if (
          parsed.championKey !== input.championKey
          || parsed.role !== input.role
          || parsed.enemyRole !== input.enemyRole
        ) {
          throw new Error('los identificadores de la respuesta no coinciden con el pedido');
        }
        const games = parsed.counters.reduce((total, counter) => total + counter.games, 0);
        return {
          stats: {
            championKey: parsed.championKey,
            role: parsed.role,
            games,
            wins: winsFrom(games, parsed.championWinRate),
          },
          matchups: parsed.counters.map((counter) => ({
            enemyChampionKey: counter.championKey,
            enemyRole: input.enemyRole,
            games: counter.games,
            wins: winsFrom(counter.games, counter.winRate),
          })),
        };
      } catch (error) {
        if (isDraftDataSourceError(error)) throw error;
        throw invalidResponse(error);
      }
    },

    async getSynergies(input) {
      try {
        const parsed = parseTeamResponse(await client.getTeam(input));
        return parsed.synergies.map((synergy) => ({
          allyChampionKey: synergy.championKey,
          allyRole: synergy.role,
          games: synergy.games,
          wins: winsFrom(synergy.games, synergy.winRate),
        }));
      } catch (error) {
        if (isDraftDataSourceError(error)) throw error;
        throw invalidResponse(error);
      }
    },
  };
}
