import { createOpggProvider } from './opgg/opgg-provider';
import type { MatchProvider } from './types';

const globalForProvider = globalThis as unknown as { __lolvaultMatchProvider?: MatchProvider };

/**
 * Fuente de partidas de la app. Hoy OP.GG (sin key, ver docs/APIS-LOL.md). Cuando haya una
 * Personal API Key de Riot, se cambia acá: la UI y el caché solo conocen `MatchProvider`.
 */
export function getMatchProvider(): MatchProvider {
  return (globalForProvider.__lolvaultMatchProvider ??= createOpggProvider());
}
