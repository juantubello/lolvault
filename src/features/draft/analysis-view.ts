import {
  DRAFT_PRIOR_GAMES,
  ratingToWinrate,
  type ChampionAnalysis,
  type DraftAnalysis,
  type DraftRisk,
  type PairAnalysis,
} from '@/features/draft/analysis';
import type { DraftMatchupScope, DraftTeam } from '@/features/draft/draft-url';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';

export type DraftAnalysisDataState = 'complete' | 'partial' | 'none';

export type DraftAnalysisValue = {
  rating: number;
  winrate: number;
  dataState: DraftAnalysisDataState;
};

export type DraftSideSummary = {
  champions: DraftAnalysisValue;
  matchups: DraftAnalysisValue;
  duos: DraftAnalysisValue;
  total: DraftAnalysisValue;
};

export type DraftChampionBreakdownRow = {
  championKey: number;
  championName: string;
  championImageUrl: string | null;
  role: DraftRole;
  base: DraftAnalysisValue;
  matchups: DraftAnalysisValue;
  duos: DraftAnalysisValue;
  total: DraftAnalysisValue;
};

export type DraftChampionBreakdown = {
  side: DraftTeam;
  rows: DraftChampionBreakdownRow[];
  totals: {
    base: DraftAnalysisValue;
    matchups: DraftAnalysisValue;
    duos: DraftAnalysisValue;
    total: DraftAnalysisValue;
  };
};

export type DraftMatchupWinner = DraftTeam | 'even' | 'no-data';

export type DraftMatchupViewRow = {
  allyChampionKey: number;
  allyChampionName: string;
  allyChampionImageUrl: string | null;
  allyRole: DraftRole;
  enemyChampionKey: number;
  enemyChampionName: string;
  enemyChampionImageUrl: string | null;
  enemyRole: DraftRole;
  winrate: number | null;
  opponentWinrate: number | null;
  games: number;
  smallSample: boolean;
  rating: number;
  winner: DraftMatchupWinner;
};

export type DraftDuoViewRow = {
  firstChampionKey: number;
  firstChampionName: string;
  firstChampionImageUrl: string | null;
  firstRole: DraftRole;
  secondChampionKey: number;
  secondChampionName: string;
  secondChampionImageUrl: string | null;
  secondRole: DraftRole;
  winrate: number | null;
};

export type DraftMatchupTotal = {
  rating: number;
  allyWinrate: number;
  opponentWinrate: number;
};

export type DraftAnalysisViewOptions = {
  imageUrls?: ReadonlyMap<number, string>;
  risk?: DraftRisk;
};

export type DraftAnalysisView = {
  summaries: Record<DraftTeam, DraftSideSummary>;
  champions: Record<DraftTeam, DraftChampionBreakdown>;
  championExtremes: {
    best: readonly string[];
    worst: readonly string[];
  } | null;
  matchups: DraftMatchupViewRow[];
  matchupTotal: DraftMatchupTotal;
  duos: Record<DraftTeam, DraftDuoViewRow[]>;
};

const ROLE_INDEX = new Map<DraftRole, number>(DRAFT_ROLES.map((role, index) => [role, index]));

function value(
  rating: number,
  dataState: DraftAnalysisDataState = 'complete',
  winrate = ratingToWinrate(rating),
): DraftAnalysisValue {
  return { rating, winrate, dataState };
}

function aggregatePairs(
  pairs: readonly PairAnalysis[],
  perspective: 1 | -1,
): DraftAnalysisValue {
  const rating = pairs.reduce((total, pair) => total + pair.rating * perspective, 0);
  if (pairs.length === 0) return value(rating);
  const withData = pairs.filter((pair) => pair.hasData).length;
  if (withData === 0) return value(rating, 'none');
  return value(rating, withData === pairs.length ? 'complete' : 'partial');
}

function combinedDataState(values: readonly DraftAnalysisValue[]): DraftAnalysisDataState {
  if (values.some((item) => item.dataState === 'none')) return 'partial';
  if (values.some((item) => item.dataState === 'partial')) return 'partial';
  return 'complete';
}

function championName(names: ReadonlyMap<number, string>, championKey: number): string {
  return names.get(championKey) ?? `Campeón ${championKey}`;
}

function championImageUrl(
  imageUrls: ReadonlyMap<number, string> | undefined,
  championKey: number,
): string | null {
  return imageUrls?.get(championKey) ?? null;
}

function pairsForChampion(
  pairs: readonly PairAnalysis[],
  championKey: number,
): PairAnalysis[] {
  return pairs.filter((pair) => (
    pair.first.championKey === championKey || pair.second.championKey === championKey
  ));
}

function buildChampionRows(
  champions: readonly ChampionAnalysis[],
  matchups: readonly PairAnalysis[],
  duos: readonly PairAnalysis[],
  side: DraftTeam,
  names: ReadonlyMap<number, string>,
  imageUrls: ReadonlyMap<number, string> | undefined,
): DraftChampionBreakdownRow[] {
  const perspective = side === 'allies' ? 1 : -1;
  return champions.map((champion) => {
    const championMatchups = matchups.filter((pair) => (
      side === 'allies'
        ? pair.first.championKey === champion.championKey
        : pair.second.championKey === champion.championKey
    ));
    const base = value(
      champion.rating,
      champion.hasData ? 'complete' : 'none',
      champion.winrate,
    );
    const matchupValue = aggregatePairs(championMatchups, perspective);
    const duoValue = aggregatePairs(pairsForChampion(duos, champion.championKey), 1);
    const totalRating = base.rating + matchupValue.rating + duoValue.rating;

    return {
      championKey: champion.championKey,
      championName: championName(names, champion.championKey),
      championImageUrl: championImageUrl(imageUrls, champion.championKey),
      role: champion.role,
      base,
      matchups: matchupValue,
      duos: duoValue,
      total: value(totalRating, combinedDataState([base, matchupValue, duoValue])),
    };
  }).sort((first, second) => (
    (ROLE_INDEX.get(first.role) ?? 0) - (ROLE_INDEX.get(second.role) ?? 0)
  ));
}

function buildChampionBreakdown(
  analysis: DraftAnalysis,
  side: DraftTeam,
  names: ReadonlyMap<number, string>,
  imageUrls: ReadonlyMap<number, string> | undefined,
): DraftChampionBreakdown {
  const allies = side === 'allies';
  const championRating = allies
    ? analysis.allyChampionRating
    : analysis.enemyChampionRating;
  const matchupRating = allies ? analysis.matchupRating : -analysis.matchupRating;
  const duoRating = allies ? analysis.allyDuoRating : analysis.enemyDuoRating;
  const totalRating = allies ? analysis.totalRating : -analysis.totalRating;

  return {
    side,
    rows: buildChampionRows(
      allies ? analysis.allyChampions : analysis.enemyChampions,
      analysis.matchups,
      allies ? analysis.allyDuos : analysis.enemyDuos,
      side,
      names,
      imageUrls,
    ),
    totals: {
      base: value(championRating),
      matchups: value(matchupRating),
      duos: value(duoRating),
      total: value(totalRating),
    },
  };
}

function championExtremes(
  allies: DraftChampionBreakdown,
  enemies: DraftChampionBreakdown,
): DraftAnalysisView['championExtremes'] {
  const rows = [...allies.rows, ...enemies.rows];
  if (rows.length === 0) return null;
  const bestRating = Math.max(...rows.map((row) => row.total.rating));
  const worstRating = Math.min(...rows.map((row) => row.total.rating));
  return {
    best: rows.filter((row) => row.total.rating === bestRating).map((row) => row.championName),
    worst: rows.filter((row) => row.total.rating === worstRating).map((row) => row.championName),
  };
}

export function buildDraftMatchupRows(
  analysis: DraftAnalysis,
  scope: DraftMatchupScope,
  names: ReadonlyMap<number, string>,
  options: DraftAnalysisViewOptions = {},
): DraftMatchupViewRow[] {
  const risk = options.risk ?? 'medium';
  return analysis.matchups
    .filter((pair) => scope === 'all' || pair.first.role === pair.second.role)
    .map((pair) => {
      const winrate = pair.hasData ? pair.winrate : null;
      return {
        allyChampionKey: pair.first.championKey,
        allyChampionName: championName(names, pair.first.championKey),
        allyChampionImageUrl: championImageUrl(options.imageUrls, pair.first.championKey),
        allyRole: pair.first.role,
        enemyChampionKey: pair.second.championKey,
        enemyChampionName: championName(names, pair.second.championKey),
        enemyChampionImageUrl: championImageUrl(options.imageUrls, pair.second.championKey),
        enemyRole: pair.second.role,
        winrate,
        opponentWinrate: winrate === null ? null : 1 - winrate,
        games: pair.games,
        smallSample: pair.hasData && pair.games < DRAFT_PRIOR_GAMES[risk],
        rating: pair.rating,
        winner: !pair.hasData
          ? 'no-data' as const
          : pair.rating > 0
            ? 'allies' as const
            : pair.rating < 0
              ? 'enemies' as const
              : 'even' as const,
      };
    })
    .sort((first, second) => (
      (ROLE_INDEX.get(first.allyRole) ?? 0) - (ROLE_INDEX.get(second.allyRole) ?? 0)
      || (ROLE_INDEX.get(first.enemyRole) ?? 0) - (ROLE_INDEX.get(second.enemyRole) ?? 0)
    ));
}

function buildDuoRows(
  pairs: readonly PairAnalysis[],
  names: ReadonlyMap<number, string>,
  imageUrls: ReadonlyMap<number, string> | undefined,
): DraftDuoViewRow[] {
  return pairs.map((pair) => ({
    firstChampionKey: pair.first.championKey,
    firstChampionName: championName(names, pair.first.championKey),
    firstChampionImageUrl: championImageUrl(imageUrls, pair.first.championKey),
    firstRole: pair.first.role,
    secondChampionKey: pair.second.championKey,
    secondChampionName: championName(names, pair.second.championKey),
    secondChampionImageUrl: championImageUrl(imageUrls, pair.second.championKey),
    secondRole: pair.second.role,
    winrate: pair.hasData ? pair.winrate : null,
  })).sort((first, second) => {
    if (first.winrate === null) return second.winrate === null ? 0 : 1;
    if (second.winrate === null) return -1;
    return second.winrate - first.winrate;
  });
}

export function buildDraftAnalysisView(
  analysis: DraftAnalysis,
  scope: DraftMatchupScope,
  names: ReadonlyMap<number, string>,
  options: DraftAnalysisViewOptions = {},
): DraftAnalysisView {
  const allyMatchups = value(analysis.matchupRating);
  const matchups = buildDraftMatchupRows(analysis, scope, names, options);
  const matchupRating = matchups.reduce((total, matchup) => total + matchup.rating, 0);
  const matchupWinrate = ratingToWinrate(matchupRating);
  const allyChampions = buildChampionBreakdown(analysis, 'allies', names, options.imageUrls);
  const enemyChampions = buildChampionBreakdown(analysis, 'enemies', names, options.imageUrls);
  return {
    summaries: {
      allies: {
        champions: value(analysis.allyChampionRating),
        matchups: allyMatchups,
        duos: value(analysis.allyDuoRating),
        total: value(analysis.totalRating, 'complete', analysis.winrate),
      },
      enemies: {
        champions: value(analysis.enemyChampionRating),
        matchups: value(-analysis.matchupRating, 'complete', 1 - allyMatchups.winrate),
        duos: value(analysis.enemyDuoRating),
        total: value(-analysis.totalRating, 'complete', 1 - analysis.winrate),
      },
    },
    champions: {
      allies: allyChampions,
      enemies: enemyChampions,
    },
    championExtremes: championExtremes(allyChampions, enemyChampions),
    matchups,
    matchupTotal: {
      rating: matchupRating,
      allyWinrate: matchupWinrate,
      opponentWinrate: 1 - matchupWinrate,
    },
    duos: {
      allies: buildDuoRows(analysis.allyDuos, names, options.imageUrls),
      enemies: buildDuoRows(analysis.enemyDuos, names, options.imageUrls),
    },
  };
}
