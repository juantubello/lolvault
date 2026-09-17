import { describe, expect, it } from 'vitest';

import {
  analyzeDraft,
  buildDraftMatrix,
  ratingToWinrate,
  type DraftMatrixRows,
  type DraftPick,
} from '@/features/draft/analysis';
import {
  buildDraftAnalysisView,
  buildDraftMatchupRows,
} from '@/features/draft/analysis-view';
import { DRAFT_ROLES } from '@/features/draft/types';

const allies = DRAFT_ROLES.map((role, index) => ({ championKey: index + 1, role }));
const enemies = DRAFT_ROLES.map((role, index) => ({ championKey: index + 6, role }));
const names = new Map([...allies, ...enemies].map((pick) => [
  pick.championKey,
  `Campeón ${pick.championKey}`,
]));

function pairRows(
  picks: readonly DraftPick[],
  kind: 'ally' | 'enemy',
): DraftMatrixRows['synergies'] {
  return picks.flatMap((first, firstIndex) => picks.flatMap((second, secondIndex) => {
    if (firstIndex === secondIndex) return [];
    return [{
      ...first,
      allyChampionKey: second.championKey,
      allyRole: second.role,
      games: 400,
      wins: kind === 'ally' ? 228 + firstIndex - secondIndex : 196 + firstIndex - secondIndex,
    }];
  }));
}

function matrixRows(): DraftMatrixRows {
  return {
    championKeys: [...allies, ...enemies].map(({ championKey }) => championKey),
    championStats: [...allies, ...enemies].map((pick, index) => ({
      ...pick,
      games: 4_000,
      wins: 1_880 + index * 24,
    })),
    matchups: allies.flatMap((ally, allyIndex) => enemies.flatMap((enemy, enemyIndex) => ([
      {
        ...ally,
        enemyChampionKey: enemy.championKey,
        enemyRole: enemy.role,
        games: 300,
        wins: 174 + allyIndex * 2 - enemyIndex,
      },
      {
        ...enemy,
        enemyChampionKey: ally.championKey,
        enemyRole: ally.role,
        games: 300,
        wins: 138 + enemyIndex - allyIndex,
      },
    ]))),
    synergies: [
      ...pairRows(allies, 'ally'),
      ...pairRows(enemies, 'enemy'),
    ],
  };
}

describe('presentación del análisis de Draft', () => {
  it('arma el total por campeón sumando ratings y recién después convierte a win rate', () => {
    const analysis = analyzeDraft(buildDraftMatrix(matrixRows()), { allies, enemies });
    const view = buildDraftAnalysisView(analysis, 'head-to-head', names);
    const row = view.champions.allies.rows[0];

    expect(row).toBeDefined();
    if (!row) return;
    const ratingSum = row.base.rating + row.matchups.rating + row.duos.rating;
    expect(row.total.rating).toBeCloseTo(ratingSum, 12);
    expect(row.total.winrate).toBeCloseTo(ratingToWinrate(ratingSum), 12);
    expect(row.total.winrate).not.toBeCloseTo(
      row.base.winrate + row.matchups.winrate + row.duos.winrate,
      6,
    );
  });

  it('niega los ratings de cruces al armar las filas del enemigo', () => {
    const analysis = analyzeDraft(buildDraftMatrix(matrixRows()), { allies, enemies });
    const view = buildDraftAnalysisView(analysis, 'head-to-head', names);
    const enemy = enemies[0];
    const row = view.champions.enemies.rows[0];

    expect(enemy).toBeDefined();
    expect(row).toBeDefined();
    if (!enemy || !row) return;
    const allyPerspective = analysis.matchups
      .filter((pair) => pair.second.championKey === enemy.championKey)
      .reduce((total, pair) => total + pair.rating, 0);
    expect(row.matchups.rating).toBeCloseTo(-allyPerspective, 12);
    expect(row.matchups.winrate).toBeCloseTo(ratingToWinrate(-allyPerspective), 12);
  });

  it('usa agregados reales en el pie aunque cada dupla aparezca en dos filas', () => {
    const analysis = analyzeDraft(buildDraftMatrix(matrixRows()), { allies, enemies });
    const view = buildDraftAnalysisView(analysis, 'head-to-head', names);
    const table = view.champions.allies;
    const duplicatedDuoRating = table.rows.reduce((total, row) => total + row.duos.rating, 0);

    expect(duplicatedDuoRating).toBeCloseTo(analysis.allyDuoRating * 2, 12);
    expect(table.totals.base.rating).toBeCloseTo(analysis.allyChampionRating, 12);
    expect(table.totals.matchups.rating).toBeCloseTo(analysis.matchupRating, 12);
    expect(table.totals.duos.rating).toBeCloseTo(analysis.allyDuoRating, 12);
    expect(table.totals.total.rating).toBeCloseTo(analysis.totalRating, 12);
    expect(view.summaries.enemies.matchups.winrate).toBeCloseTo(
      1 - view.summaries.allies.matchups.winrate,
      12,
    );
    expect(view.summaries.enemies.total.winrate).toBeCloseTo(1 - analysis.winrate, 12);
  });

  it('devuelve cinco cruces cabeza a cabeza y los veinticinco al pedir todos', () => {
    const analysis = analyzeDraft(buildDraftMatrix(matrixRows()), { allies, enemies });

    expect(buildDraftMatchupRows(analysis, 'head-to-head', names)).toHaveLength(5);
    expect(buildDraftMatchupRows(analysis, 'all', names)).toHaveLength(25);
  });

  it('conserva como sin datos un cruce y una dupla sin las dos direcciones', () => {
    const rows = matrixRows();
    const missingAlly = allies[0];
    const missingEnemy = enemies[0];
    const missingDuo = allies[1];
    expect(missingAlly).toBeDefined();
    expect(missingEnemy).toBeDefined();
    expect(missingDuo).toBeDefined();
    if (!missingAlly || !missingEnemy || !missingDuo) return;
    const matrix = buildDraftMatrix({
      ...rows,
      matchups: rows.matchups.filter((row) => !(
        row.championKey === missingEnemy.championKey
        && row.role === missingEnemy.role
        && row.enemyChampionKey === missingAlly.championKey
        && row.enemyRole === missingAlly.role
      )),
      synergies: rows.synergies.filter((row) => !(
        row.championKey === missingDuo.championKey
        && row.role === missingDuo.role
        && row.allyChampionKey === missingAlly.championKey
        && row.allyRole === missingAlly.role
      )),
    });
    const analysis = analyzeDraft(matrix, { allies, enemies });
    const view = buildDraftAnalysisView(analysis, 'all', names);
    const matchup = view.matchups.find((row) => (
      row.allyChampionKey === missingAlly.championKey
      && row.enemyChampionKey === missingEnemy.championKey
    ));
    const duo = view.duos.allies.find((row) => (
      row.firstChampionKey === missingAlly.championKey
      && row.secondChampionKey === missingDuo.championKey
    ));

    expect(matchup).toMatchObject({ winrate: null, winner: 'no-data' });
    expect(duo).toMatchObject({ winrate: null });
  });
});
