import {
  ratingToWinrate,
  type ChampionAnalysis,
  type DraftAnalysis,
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
  allyRole: DraftRole;
  enemyChampionKey: number;
  enemyChampionName: string;
  enemyRole: DraftRole;
  winrate: number | null;
  winner: DraftMatchupWinner;
};

export type DraftDuoViewRow = {
  firstChampionKey: number;
  firstChampionName: string;
  firstRole: DraftRole;
  secondChampionKey: number;
  secondChampionName: string;
  secondRole: DraftRole;
  winrate: number | null;
};

export type DraftAnalysisView = {
  summaries: Record<DraftTeam, DraftSideSummary>;
  champions: Record<DraftTeam, DraftChampionBreakdown>;
  matchups: DraftMatchupViewRow[];
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
    ),
    totals: {
      base: value(championRating),
      matchups: value(matchupRating),
      duos: value(duoRating),
      total: value(totalRating),
    },
  };
}

export function buildDraftMatchupRows(
  analysis: DraftAnalysis,
  scope: DraftMatchupScope,
  names: ReadonlyMap<number, string>,
): DraftMatchupViewRow[] {
  return analysis.matchups
    .filter((pair) => scope === 'all' || pair.first.role === pair.second.role)
    .map((pair) => ({
      allyChampionKey: pair.first.championKey,
      allyChampionName: championName(names, pair.first.championKey),
      allyRole: pair.first.role,
      enemyChampionKey: pair.second.championKey,
      enemyChampionName: championName(names, pair.second.championKey),
      enemyRole: pair.second.role,
      winrate: pair.hasData ? pair.winrate : null,
      winner: !pair.hasData
        ? 'no-data' as const
        : pair.rating > 1e-10
          ? 'allies' as const
          : pair.rating < -1e-10
            ? 'enemies' as const
            : 'even' as const,
    }))
    .sort((first, second) => (
      (ROLE_INDEX.get(first.allyRole) ?? 0) - (ROLE_INDEX.get(second.allyRole) ?? 0)
      || (ROLE_INDEX.get(first.enemyRole) ?? 0) - (ROLE_INDEX.get(second.enemyRole) ?? 0)
    ));
}

function buildDuoRows(
  pairs: readonly PairAnalysis[],
  names: ReadonlyMap<number, string>,
): DraftDuoViewRow[] {
  return pairs.map((pair) => ({
    firstChampionKey: pair.first.championKey,
    firstChampionName: championName(names, pair.first.championKey),
    firstRole: pair.first.role,
    secondChampionKey: pair.second.championKey,
    secondChampionName: championName(names, pair.second.championKey),
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
): DraftAnalysisView {
  const allyMatchups = value(analysis.matchupRating);
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
      allies: buildChampionBreakdown(analysis, 'allies', names),
      enemies: buildChampionBreakdown(analysis, 'enemies', names),
    },
    matchups: buildDraftMatchupRows(analysis, scope, names),
    duos: {
      allies: buildDuoRows(analysis.allyDuos, names),
      enemies: buildDuoRows(analysis.enemyDuos, names),
    },
  };
}
