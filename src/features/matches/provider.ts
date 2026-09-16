import { OPGG_REGION, type OpggScoutRegion } from '@/config';
import { createOpggProvider } from '@/features/matches/opgg/opgg-provider';
import type { MatchProvider } from '@/features/matches/types';

const globalForProvider = globalThis as unknown as {
  __lolvaultMatchProviders?: Map<OpggScoutRegion, MatchProvider>;
};

/**
 * Fuente de partidas de la app. Hoy OP.GG (sin key, ver docs/APIS-LOL.md). Cuando haya una
 * Personal API Key de Riot, se cambia acá: la UI y el caché solo conocen `MatchProvider`.
 */
export function getMatchProvider(region: OpggScoutRegion = OPGG_REGION): MatchProvider {
  const providers = (globalForProvider.__lolvaultMatchProviders ??= new Map());
  let provider = providers.get(region);
  if (!provider) {
    provider = createOpggProvider({ region });
    providers.set(region, provider);
  }
  return provider;
}
