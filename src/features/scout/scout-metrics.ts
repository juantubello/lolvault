/** Calculos puros del Scout. La UI recibe ratios y promedios ya resueltos. */
import { APP_TIME_ZONE } from '@/config';
import { isRemake, kdaRatio } from '@/features/matches/player-summary';
import type {
  PlayerMatchSummary,
  RankedSeason,
  RankedSeasonChampion,
} from '@/features/matches/types';

export type ScoutBucket = {
  key: string;
  label: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  share: number;
};

export type ScoutMatchMetrics = {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kda: number | null;
  killParticipation: number;
  csPerMinute: number;
  damagePerMinute: number;
  avgDurationSeconds: number;
  roles: ScoutBucket[];
  weekdays: ScoutBucket[];
  hours: ScoutBucket[];
  sides: ScoutBucket[];
};

export type RankedChampionMetrics = {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  avgDurationSeconds: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kda: number | null;
  killParticipation: number;
  damageParticipation: number;
  damageDistribution: number;
  csPerGame: number;
  csPerMinute: number;
  goldPerGame: number;
  damagePerGame: number;
  damagePerMinute: number;
  visionScorePerGame: number;
  controlWardsPerGame: number;
  wardsPlacedPerGame: number;
  wardsKilledPerGame: number;
  opScore: number;
  opScoreRank: number;
  laneScore: number;
  laneLeadRate: number;
  damageTakenPerGame: number;
  damageMitigatedPerGame: number;
  healPerGame: number;
  healToTeamPerGame: number;
  shieldToTeamPerGame: number;
  physicalDamagePerGame: number;
  magicDamagePerGame: number;
  trueDamagePerGame: number;
  objectiveDamagePerGame: number;
  turretDamagePerGame: number;
  ccScorePerGame: number;
};

export type RecentSeasonComparison = {
  recent: { games: number; wins: number; losses: number; winRate: number };
  season: { games: number; wins: number; losses: number; winRate: number } | null;
  winRateDelta: number | null;
};

const WEEKDAYS = [
  ['Mon', 'Lunes'],
  ['Tue', 'Martes'],
  ['Wed', 'Miércoles'],
  ['Thu', 'Jueves'],
  ['Fri', 'Viernes'],
  ['Sat', 'Sábado'],
  ['Sun', 'Domingo'],
] as const;

function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

function buildBuckets(
  groups: ReadonlyMap<string, PlayerMatchSummary[]>,
  definitions: readonly (readonly [string, string])[],
  totalGames: number,
): ScoutBucket[] {
  return definitions.map(([key, label]) => {
    const matches = groups.get(key) ?? [];
    const wins = matches.filter((match) => match.win).length;
    return {
      key,
      label,
      games: matches.length,
      wins,
      losses: matches.length - wins,
      winRate: ratio(wins, matches.length),
      share: ratio(matches.length, totalGames),
    };
  });
}

function groupBy(
  matches: PlayerMatchSummary[],
  keyFor: (match: PlayerMatchSummary) => string | null,
): Map<string, PlayerMatchSummary[]> {
  const groups = new Map<string, PlayerMatchSummary[]>();
  for (const match of matches) {
    const key = keyFor(match);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), match]);
  }
  return groups;
}

function datePart(date: Date, timeZone: string, part: 'weekday' | 'hour'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    ...(part === 'weekday' ? { weekday: 'short' as const } : { hour: '2-digit' as const, hourCycle: 'h23' as const }),
  }).formatToParts(date);
  return parts.find((candidate) => candidate.type === part)?.value ?? '';
}

/** Resume solo partidas completas; remakes y lados de modos no-SR no contaminan los calculos. */
export function summarizeScoutMatches(
  matches: PlayerMatchSummary[],
  timeZone = APP_TIME_ZONE,
): ScoutMatchMetrics {
  const counted = matches.filter((match) => !isRemake(match));
  const games = counted.length;
  const wins = counted.filter((match) => match.win).length;
  const sum = (key: 'kills' | 'deaths' | 'assists' | 'teamKills' | 'cs' | 'damageDealt' | 'durationSeconds') =>
    counted.reduce((total, match) => total + match[key], 0);
  const durationMinutes = sum('durationSeconds') / 60;

  const roleMatches = counted.filter((match) => match.position);
  const sideMatches = counted.filter((match) => match.teamKey === 'BLUE' || match.teamKey === 'RED');
  const roleDefinitions = [...new Set(roleMatches.flatMap((match) => match.position ? [match.position] : []))]
    .map((position) => [position, position] as const);
  const hourDefinitions = Array.from({ length: 24 }, (_, hour) => {
    const key = String(hour).padStart(2, '0');
    return [key, `${key}:00`] as const;
  });

  return {
    games,
    wins,
    losses: games - wins,
    winRate: ratio(wins, games),
    avgKills: ratio(sum('kills'), games),
    avgDeaths: ratio(sum('deaths'), games),
    avgAssists: ratio(sum('assists'), games),
    kda: kdaRatio(sum('kills'), sum('deaths'), sum('assists')),
    killParticipation: ratio(sum('kills') + sum('assists'), sum('teamKills')),
    csPerMinute: ratio(sum('cs'), durationMinutes),
    damagePerMinute: ratio(sum('damageDealt'), durationMinutes),
    avgDurationSeconds: ratio(sum('durationSeconds'), games),
    roles: buildBuckets(groupBy(roleMatches, (match) => match.position), roleDefinitions, roleMatches.length)
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.key.localeCompare(b.key)),
    weekdays: buildBuckets(
      groupBy(counted, (match) => datePart(match.playedAt, timeZone, 'weekday')),
      WEEKDAYS,
      games,
    ),
    hours: buildBuckets(
      groupBy(counted, (match) => datePart(match.playedAt, timeZone, 'hour')),
      hourDefinitions,
      games,
    ),
    sides: buildBuckets(
      groupBy(sideMatches, (match) => match.teamKey),
      [['BLUE', 'Lado azul'], ['RED', 'Lado rojo']],
      sideMatches.length,
    ),
  };
}

/**
 * OP.GG manda promedios acumulados: KP, participacion de dano y OP Score tambien se dividen por
 * `play`. Ademas, true_damage_to_champion contiene el dano total; el verdadero es el remanente.
 */
export function normalizeRankedChampion(champion: RankedSeasonChampion): RankedChampionMetrics {
  const games = champion.games;
  const perGame = (value: number) => ratio(value, games);
  const minutes = champion.durationSeconds / 60;
  const trueDamage = Math.max(
    0,
    champion.extend.totalDamageToChampion
      - champion.extend.physicalDamageToChampion
      - champion.extend.magicDamageToChampion,
  );
  return {
    games,
    wins: champion.wins,
    losses: champion.losses,
    winRate: ratio(champion.wins, games),
    avgDurationSeconds: perGame(champion.durationSeconds),
    avgKills: perGame(champion.basic.kills),
    avgDeaths: perGame(champion.basic.deaths),
    avgAssists: perGame(champion.basic.assists),
    kda: kdaRatio(champion.basic.kills, champion.basic.deaths, champion.basic.assists),
    killParticipation: perGame(champion.basic.killParticipation),
    damageParticipation: perGame(champion.basic.damageParticipation),
    damageDistribution: perGame(champion.basic.damageDistribution),
    csPerGame: perGame(champion.basic.cs),
    csPerMinute: ratio(champion.basic.cs, minutes),
    goldPerGame: perGame(champion.basic.gold),
    damagePerGame: perGame(champion.basic.damageToChampion),
    damagePerMinute: ratio(champion.basic.damageToChampion, minutes),
    visionScorePerGame: perGame(champion.basic.visionScore),
    controlWardsPerGame: perGame(champion.basic.controlWards),
    wardsPlacedPerGame: perGame(champion.basic.wardsPlaced),
    wardsKilledPerGame: perGame(champion.basic.wardsKilled),
    opScore: perGame(champion.basic.opScore),
    opScoreRank: perGame(champion.basic.opScoreRank),
    laneScore: ratio(champion.basic.laneScore, champion.basic.laneScoreCount),
    laneLeadRate: perGame(champion.basic.laneLead),
    damageTakenPerGame: perGame(champion.extend.damageTaken),
    damageMitigatedPerGame: perGame(champion.extend.damageSelfMitigated),
    healPerGame: perGame(champion.extend.heal),
    healToTeamPerGame: perGame(champion.extend.healToTeam),
    shieldToTeamPerGame: perGame(champion.extend.shieldToTeam),
    physicalDamagePerGame: perGame(champion.extend.physicalDamageToChampion),
    magicDamagePerGame: perGame(champion.extend.magicDamageToChampion),
    trueDamagePerGame: perGame(trueDamage),
    objectiveDamagePerGame: perGame(champion.extend.damageToObjective),
    turretDamagePerGame: perGame(champion.extend.damageToTurret),
    ccScorePerGame: perGame(champion.extend.ccScore),
  };
}

export function compareRecentToSeason(
  matches: PlayerMatchSummary[],
  season: RankedSeason | null | undefined,
): RecentSeasonComparison {
  const counted = matches.filter((match) => !isRemake(match));
  const recentWins = counted.filter((match) => match.win).length;
  const recent = {
    games: counted.length,
    wins: recentWins,
    losses: counted.length - recentWins,
    winRate: ratio(recentWins, counted.length),
  };
  if (!season) return { recent, season: null, winRateDelta: null };
  const seasonRecord = {
    games: season.games,
    wins: season.wins,
    losses: season.losses,
    winRate: ratio(season.wins, season.games),
  };
  return {
    recent,
    season: seasonRecord,
    winRateDelta: recent.winRate - seasonRecord.winRate,
  };
}
