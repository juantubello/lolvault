import { DRAFT_PRIOR_GAMES, type DraftRisk } from '@/features/draft/analysis';
import type {
  RankEntry,
  RankedSeasonChampion,
  SeasonChampionStat,
  SummonerProfile,
} from '@/features/matches/types';

/** Con menos de diez partidas, una racha corta domina el registro y no permite afirmar tendencia. */
export const PERSONAL_STAT_SMALL_SAMPLE_GAMES = 10;

type ChampionRecord = {
  championId: number;
  games: number;
  wins: number;
  losses: number;
};

export type PersonalChampionStat =
  | { status: 'no-profile' }
  | { status: 'no-season' }
  | { status: 'not-played' }
  | {
      status: 'played';
      games: number;
      wins: number;
      losses: number;
      winrate: number;
      adjustedWinrate: number;
      difference: number;
      smallSample: boolean;
      isBestChampion: boolean;
      isBelowAverage: boolean;
    };

type SeasonSource = {
  games: number;
  wins: number;
  champions: ChampionRecord[];
};

function validRecord(record: ChampionRecord): boolean {
  return Number.isFinite(record.games)
    && Number.isFinite(record.wins)
    && Number.isFinite(record.losses)
    && record.games > 0
    && record.wins >= 0
    && record.losses >= 0
    && record.wins <= record.games;
}

function championRecord(
  champion: RankedSeasonChampion | SeasonChampionStat,
): ChampionRecord {
  return {
    championId: champion.championId,
    games: champion.games,
    wins: champion.wins,
    losses: champion.losses,
  };
}

function rankGames(rank: RankEntry): number {
  return rank.wins + rank.losses;
}

function fallbackRank(profile: SummonerProfile): RankEntry | undefined {
  return profile.ranks.find((rank) => rank.queue === 'SOLORANKED' && rankGames(rank) > 0)
    ?? [...profile.ranks]
      .filter((rank) => rankGames(rank) > 0)
      .sort((a, b) => rankGames(b) - rankGames(a))[0];
}

function seasonSource(profile: SummonerProfile): SeasonSource | null {
  if (profile.rankedSeason) {
    const { games, wins } = profile.rankedSeason;
    if (games <= 0 || wins < 0 || wins > games) return null;
    return {
      games,
      wins,
      champions: profile.rankedSeason.champions.map(championRecord).filter(validRecord),
    };
  }

  const rank = fallbackRank(profile);
  if (!rank) return null;
  return {
    games: rankGames(rank),
    wins: rank.wins,
    champions: profile.seasonChampions.map(championRecord).filter(validRecord),
  };
}

function adjustedWinrate(
  record: ChampionRecord,
  seasonWinrate: number,
  risk: DraftRisk,
): number {
  const prior = DRAFT_PRIOR_GAMES[risk];
  return (record.wins + prior * seasonWinrate) / (record.games + prior);
}

export function getPersonalChampionStat(
  profile: SummonerProfile | null,
  championId: number,
  risk: DraftRisk,
): PersonalChampionStat {
  if (!profile) return { status: 'no-profile' };
  const season = seasonSource(profile);
  if (!season) return { status: 'no-season' };
  const record = season.champions.find((champion) => champion.championId === championId);
  if (!record) return { status: 'not-played' };

  const seasonWinrate = season.wins / season.games;
  const normalized = season.champions.map((champion) => ({
    champion,
    difference: adjustedWinrate(champion, seasonWinrate, risk) - seasonWinrate,
  }));
  const difference = adjustedWinrate(record, seasonWinrate, risk) - seasonWinrate;
  const best = normalized
    .filter(({ champion }) => champion.games >= PERSONAL_STAT_SMALL_SAMPLE_GAMES)
    .sort((a, b) => b.difference - a.difference || b.champion.games - a.champion.games)[0];
  const smallSample = record.games < PERSONAL_STAT_SMALL_SAMPLE_GAMES;

  return {
    status: 'played',
    games: record.games,
    wins: record.wins,
    losses: record.losses,
    winrate: record.wins / record.games,
    adjustedWinrate: seasonWinrate + difference,
    difference,
    smallSample,
    isBestChampion: !smallSample
      && difference > 0
      && best?.champion.championId === record.championId,
    isBelowAverage: !smallSample && difference < 0,
  };
}

export function personalChampionLabel(
  playerName: string,
  stat: PersonalChampionStat,
): string {
  if (stat.status === 'no-profile' || stat.status === 'no-season') {
    return `${playerName}: sin datos de temporada`;
  }
  if (stat.status === 'not-played') return `${playerName} no lo jugó esta temporada`;
  if (stat.smallSample) {
    return `${playerName}: ${stat.wins}-${stat.losses} esta temporada · muestra chica`;
  }

  const percentage = stat.winrate.toLocaleString('es-AR', {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const tendency = stat.isBestChampion
    ? ' · su mejor campeón'
    : stat.isBelowAverage
      ? ' · por debajo de su promedio'
      : stat.difference > 0
        ? ' · por encima de su promedio'
        : '';
  return `${playerName}: ${stat.wins}-${stat.losses} · ${percentage} · ${stat.games} partidas${tendency}`;
}
