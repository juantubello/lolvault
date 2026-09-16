/** Estadísticas de las últimas partidas de un jugador, como el resumen de OP.GG. Funciones puras. */
import type { PlayerMatchSummary } from '@/features/matches/types';

/** Partidas más cortas que esto son remakes: no cuentan para victorias ni promedios (como OP.GG). */
export const REMAKE_MAX_SECONDS = 5 * 60;

export type ChampionSummary = {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  /** null = sin muertes (KDA perfecto). */
  kda: number | null;
};

export type PositionSummary = {
  position: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  /** null = sin muertes (KDA perfecto). */
  kda: number | null;
};

export type RecentSummary = {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kda: number | null;
  /** (kills + asistencias) / kills del equipo, 0–1. */
  killParticipation: number;
  topChampions: ChampionSummary[];
  roles: { position: string; games: number }[];
};

export function isRemake(match: Pick<PlayerMatchSummary, 'durationSeconds'>): boolean {
  return match.durationSeconds < REMAKE_MAX_SECONDS;
}

/** Resultado para mostrar: siempre con texto, el color es refuerzo. */
export function matchOutcome(match: Pick<PlayerMatchSummary, 'durationSeconds' | 'win'>): {
  label: 'Victoria' | 'Derrota' | 'Remake';
  tone: 'win' | 'loss' | 'neutral';
} {
  if (isRemake(match)) return { label: 'Remake', tone: 'neutral' };
  return match.win ? { label: 'Victoria', tone: 'win' } : { label: 'Derrota', tone: 'loss' };
}

export function kdaRatio(kills: number, deaths: number, assists: number): number | null {
  return deaths === 0 ? null : (kills + assists) / deaths;
}

function aggregateMatches<T extends { games: number; wins: number; losses: number; winRate: number; kda: number | null }>(
  groups: Iterable<PlayerMatchSummary[]>,
  build: (matches: PlayerMatchSummary[]) => Omit<T, 'games' | 'wins' | 'losses' | 'winRate' | 'kda'>,
): T[] {
  return [...groups].map((matches) => {
    const wins = matches.filter((match) => match.win).length;
    const sum = (key: 'kills' | 'deaths' | 'assists') =>
      matches.reduce((total, match) => total + match[key], 0);
    return {
      ...build(matches),
      games: matches.length,
      wins,
      losses: matches.length - wins,
      winRate: ratio(wins, matches.length),
      kda: kdaRatio(sum('kills'), sum('deaths'), sum('assists')),
    } as T;
  });
}

/** Rendimiento por lane en partidas completas; los remakes no cuentan. */
export function summarizeMatchesByPosition(matches: PlayerMatchSummary[]): PositionSummary[] {
  const groups = new Map<string, PlayerMatchSummary[]>();
  for (const match of matches) {
    if (isRemake(match) || !match.position) continue;
    groups.set(match.position, [...(groups.get(match.position) ?? []), match]);
  }
  return aggregateMatches<PositionSummary>(groups.values(), (positionMatches) => ({
    position: positionMatches[0]!.position!,
  })).sort((a, b) => b.games - a.games || a.position.localeCompare(b.position));
}

/** Rendimiento por campeón en partidas completas; devuelve todos, no solo el top. */
export function summarizeMatchesByChampion(matches: PlayerMatchSummary[]): ChampionSummary[] {
  const groups = new Map<number, PlayerMatchSummary[]>();
  for (const match of matches) {
    if (isRemake(match)) continue;
    groups.set(match.championId, [...(groups.get(match.championId) ?? []), match]);
  }
  return aggregateMatches<ChampionSummary>(groups.values(), (championMatches) => ({
    championId: championMatches[0]!.championId,
    championName: championMatches[0]!.championName,
  })).sort(
    (a, b) => b.games - a.games || b.winRate - a.winRate || a.championName.localeCompare(b.championName),
  );
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

export function summarizeMatches(matches: PlayerMatchSummary[], topCount = 3): RecentSummary {
  const counted = matches.filter((match) => !isRemake(match));
  const games = counted.length;
  const wins = counted.filter((match) => match.win).length;

  const kills = counted.reduce((sum, match) => sum + match.kills, 0);
  const deaths = counted.reduce((sum, match) => sum + match.deaths, 0);
  const assists = counted.reduce((sum, match) => sum + match.assists, 0);
  const teamKills = counted.reduce((sum, match) => sum + match.teamKills, 0);

  const topChampions = summarizeMatchesByChampion(counted).slice(0, topCount);

  const roleCounts = new Map<string, number>();
  for (const match of counted) {
    if (match.position) roleCounts.set(match.position, (roleCounts.get(match.position) ?? 0) + 1);
  }

  return {
    games,
    wins,
    losses: games - wins,
    winRate: ratio(wins, games),
    avgKills: ratio(kills, games),
    avgDeaths: ratio(deaths, games),
    avgAssists: ratio(assists, games),
    kda: kdaRatio(kills, deaths, assists),
    killParticipation: ratio(kills + assists, teamKills),
    topChampions,
    roles: [...roleCounts.entries()]
      .map(([position, roleGames]) => ({ position, games: roleGames }))
      .sort((a, b) => b.games - a.games),
  };
}
