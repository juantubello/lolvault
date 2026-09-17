import { describe, expect, it } from 'vitest';

import {
  analyzeDraft,
  analyzeMatchup,
  buildDraftMatrix,
  getSuggestions,
  type Draft,
  type DraftMatrixRows,
  type DraftPick,
  type DraftRisk,
  type DraftSuggestion,
} from '@/features/draft/analysis';
import { estimateMissingEnemyPicks } from '@/features/draft/expected-enemy';
import { buildDraftChampionGrid } from '@/features/draft/suggestion-grid';
import { DRAFT_ROLES } from '@/features/draft/types';

const risk: DraftRisk = 'very-high';

function stat(championKey: number, role: DraftPick['role'], games: number, wins = games / 2) {
  return { championKey, role, games, wins };
}

function matchup(
  championKey: number,
  role: DraftPick['role'],
  enemyChampionKey: number,
  enemyRole: DraftPick['role'],
  games: number,
  wins: number,
) {
  return { championKey, role, enemyChampionKey, enemyRole, games, wins };
}

function suggestionFor(
  rows: DraftMatrixRows,
  draft: Draft,
  candidate: DraftPick,
): { matrix: ReturnType<typeof buildDraftMatrix>; suggestion: DraftSuggestion } {
  const matrix = buildDraftMatrix(rows);
  const analysis = analyzeDraft(matrix, {
    allies: [...draft.allies, candidate],
    enemies: draft.enemies,
  }, risk);
  return {
    matrix,
    suggestion: { ...candidate, winrate: analysis.winrate, analysis },
  };
}

describe('relleno esperado de roles enemigos', () => {
  it('usa sólo elegibles del rol y pondera igual 1×/1× y triple 3× por sus partidas', () => {
    const candidate = { championKey: 1, role: 'middle' } as const;
    const enemies = [
      { championKey: 10, role: 'support' } as const,
      { championKey: 11, role: 'support' } as const,
      { championKey: 12, role: 'support' } as const,
    ];
    const rows: DraftMatrixRows = {
      championKeys: [1, 10, 11, 12, 13, 20, 21, 22, 23],
      championStats: [
        stat(1, 'middle', 2_000),
        stat(10, 'support', 1_000),
        stat(11, 'support', 1_000),
        stat(12, 'support', 3_000),
        // Tiene mucho volumen, pero no en support: no puede entrar en el promedio de ese rol.
        stat(13, 'top', 50_000),
        stat(20, 'top', 2_000),
        stat(21, 'jungle', 2_000),
        stat(22, 'middle', 2_000),
        stat(23, 'bottom', 2_000),
      ],
      matchups: [
        matchup(1, 'middle', 10, 'support', 1_000, 600),
        matchup(10, 'support', 1, 'middle', 1_000, 400),
        matchup(1, 'middle', 11, 'support', 1_000, 500),
        matchup(11, 'support', 1, 'middle', 1_000, 500),
        matchup(1, 'middle', 12, 'support', 1_000, 400),
        matchup(12, 'support', 1, 'middle', 1_000, 600),
        // Si el top 13 entrara por error, este cruce dominaría el resultado.
        matchup(1, 'middle', 13, 'top', 1_000, 1_000),
        matchup(13, 'top', 1, 'middle', 1_000, 0),
      ],
      synergies: [],
    };
    const draft: Draft = {
      allies: [],
      enemies: [
        { championKey: 20, role: 'top' },
        { championKey: 21, role: 'jungle' },
        { championKey: 22, role: 'middle' },
        { championKey: 23, role: 'bottom' },
      ],
    };
    const { matrix, suggestion } = suggestionFor(rows, draft, candidate);
    const result = estimateMissingEnemyPicks(matrix, draft, [suggestion], risk);
    const supportPool = result.rolePools.find(({ role }) => role === 'support');
    const ratings = enemies.map((enemy) => analyzeMatchup(matrix, candidate, enemy, risk).rating);
    const expected = (ratings[0]! + ratings[1]! + 3 * ratings[2]!) / 5;

    expect(supportPool?.eligibleChampionKeys).toEqual([10, 11, 12]);
    expect(result.suggestions[0]?.expectedRating).toBeCloseTo(expected, 12);
    expect(result.suggestions[0]?.counterpickRating).toBeCloseTo(Math.min(...ratings), 12);
    expect(result.suggestions[0]?.counterpickDrop).toBeGreaterThan(0);
    expect(result.suggestions[0]?.notablyBadFloor).toBe(true);
  });

  it('marca por cuánto puede caer el pick, no por dónde queda el piso', () => {
    const candidate = { championKey: 1, role: 'middle' } as const;
    // El umbral tiene que ser RELATIVO a la expectativa de cada pick. Con un piso absoluto, un
    // draft que va perdiendo marca absolutamente todos los candidatos: medido sobre la matriz real,
    // un corte en 47 % marcaba las 72 sugerencias, o sea que no distinguía nada.
    // Acá los tres rivales posibles son idénticos, así que no hay contrapick: no puede caer nada.
    const rows: DraftMatrixRows = {
      championKeys: [1, 10, 11, 12, 20, 21, 22, 23],
      championStats: [
        { championKey: 1, role: 'middle', games: 20_000, wins: 10_000 },
        stat(10, 'support', 2_000),
        stat(11, 'support', 2_000),
        stat(12, 'support', 2_000),
        stat(20, 'top', 2_000),
        stat(21, 'jungle', 2_000),
        stat(22, 'middle', 2_000),
        stat(23, 'bottom', 2_000),
      ],
      // Los tres rivales posibles le van igual de mal: el piso queda bajo, pero elegir uno u otro
      // no cambia nada, así que no hay contrapick que temer.
      matchups: [10, 11, 12].flatMap((enemy) => [
        matchup(1, 'middle', enemy, 'support', 20_000, 6_000),
        matchup(enemy, 'support', 1, 'middle', 20_000, 14_000),
      ]),
      synergies: [],
    };
    const draft: Draft = {
      allies: [],
      enemies: [
        { championKey: 20, role: 'top' },
        { championKey: 21, role: 'jungle' },
        { championKey: 22, role: 'middle' },
        { championKey: 23, role: 'bottom' },
      ],
    };
    const { matrix, suggestion } = suggestionFor(rows, draft, candidate);
    const result = estimateMissingEnemyPicks(matrix, draft, [suggestion], risk);
    const estimate = result.suggestions[0]!;

    // El piso queda bien por debajo del 47 % que usaba el criterio viejo...
    expect(estimate.counterpickWinrate).toBeLessThan(0.47);
    // ...pero no hay nada que el rival pueda hacer para empeorarlo, así que no se marca.
    expect(estimate.counterpickDrop).toBeCloseTo(0, 12);
    expect(estimate.notablyBadFloor).toBe(false);
  });

  it('baja al neutral contra todos que pierde contra los picks populares del rol', () => {
    const rows: DraftMatrixRows = {
      championKeys: [1, 2, 10, 11],
      championStats: [
        stat(1, 'middle', 2_000),
        stat(2, 'middle', 2_000),
        stat(10, 'support', 6_000),
        stat(11, 'support', 2_000),
      ],
      matchups: [
        matchup(1, 'middle', 10, 'support', 2_000, 700),
        matchup(10, 'support', 1, 'middle', 2_000, 1_300),
        matchup(1, 'middle', 11, 'support', 2_000, 700),
        matchup(11, 'support', 1, 'middle', 2_000, 1_300),
      ],
      synergies: [],
    };
    const matrix = buildDraftMatrix(rows);
    const draft: Draft = { allies: [], enemies: [] };
    const legacy = getSuggestions({ ...matrix, championKeys: [1, 2] }, draft, {
      risk,
      topN: 2,
    }).find(({ role }) => role === 'middle')?.suggestions ?? [];
    const catalog = [1, 2, 10, 11].map((key) => ({
      key,
      name: `Campeón ${key}`,
      imageUrl: `https://example.test/${key}.png`,
      searchKey: `campeon${key}`,
    }));
    const grid = buildDraftChampionGrid({
      matrix,
      draft,
      slot: { team: 'allies', role: 'middle' },
      risk,
      champions: catalog,
    }).filter(({ kind }) => kind === 'suggestion');

    expect(legacy.map(({ championKey }) => championKey)).toEqual([1, 2]);
    expect(grid.map(({ key }) => key)).toEqual([2, 1]);
    expect(grid[0]?.winrate).toBe(0.5);
    expect(grid[1]?.winrate).toBeLessThan(0.5);
  });

  it('no deja que un campeón ya usado aparezca como relleno', () => {
    const candidate = { championKey: 1, role: 'middle' } as const;
    const draft: Draft = {
      allies: [],
      enemies: [{ championKey: 10, role: 'top' }],
    };
    const rows: DraftMatrixRows = {
      championKeys: [1, 10, 11],
      championStats: [
        stat(1, 'middle', 2_000),
        stat(10, 'top', 2_000),
        stat(10, 'support', 2_000),
        stat(11, 'support', 2_000),
      ],
      matchups: [],
      synergies: [],
    };
    const { matrix, suggestion } = suggestionFor(rows, draft, candidate);
    const result = estimateMissingEnemyPicks(matrix, draft, [suggestion], risk);

    expect(result.rolePools.find(({ role }) => role === 'support')?.eligibleChampionKeys)
      .toEqual([11]);
  });

  it('sin roles enemigos vacíos conserva el resultado exacto de analyzeDraft', () => {
    const candidate = { championKey: 1, role: 'middle' } as const;
    const enemies = DRAFT_ROLES.map((role, index) => ({ championKey: index + 10, role }));
    const draft: Draft = { allies: [], enemies };
    const rows: DraftMatrixRows = {
      championKeys: [1, 2, ...enemies.map(({ championKey }) => championKey)],
      championStats: [stat(1, 'middle', 2_000), stat(2, 'middle', 2_000, 1_100), ...enemies.map((enemy) => (
        stat(enemy.championKey, enemy.role, 2_000)
      ))],
      matchups: [],
      synergies: [],
    };
    const { matrix, suggestion } = suggestionFor(rows, draft, candidate);
    const result = estimateMissingEnemyPicks(matrix, draft, [suggestion], risk);
    const estimate = result.suggestions[0];

    expect(result.missingRoles).toEqual([]);
    expect(estimate?.expectedRating).toBe(suggestion.analysis.totalRating);
    expect(estimate?.expectedWinrate).toBe(suggestion.winrate);
    expect(estimate?.counterpickWinrate).toBe(suggestion.winrate);

    const legacy = getSuggestions({ ...matrix, championKeys: [1, 2] }, draft, {
      risk,
      topN: 2,
    }).find(({ role }) => role === 'middle')?.suggestions ?? [];
    const grid = buildDraftChampionGrid({
      matrix,
      draft,
      slot: { team: 'allies', role: 'middle' },
      risk,
      champions: matrix.championKeys.map((key) => ({
        key,
        name: `Campeón ${key}`,
        imageUrl: `https://example.test/${key}.png`,
        searchKey: `campeon${key}`,
      })),
    }).filter(({ kind }) => kind === 'suggestion');
    expect(grid.map(({ key, winrate }) => ({ key, winrate }))).toEqual(
      legacy.map(({ championKey: key, winrate }) => ({ key, winrate })),
    );
  });

  it('no suma duplas que involucren al relleno desconocido', () => {
    const candidate = { championKey: 1, role: 'middle' } as const;
    const draft: Draft = { allies: [], enemies: [] };
    const baseRows: DraftMatrixRows = {
      championKeys: [1, 10],
      championStats: [stat(1, 'middle', 2_000), stat(10, 'support', 2_000)],
      matchups: [],
      synergies: [],
    };
    const noisyRows: DraftMatrixRows = {
      ...baseRows,
      synergies: [
        { championKey: 10, role: 'support', allyChampionKey: 1, allyRole: 'middle', games: 2_000, wins: 2_000 },
        { championKey: 1, role: 'middle', allyChampionKey: 10, allyRole: 'support', games: 2_000, wins: 2_000 },
      ],
    };
    const base = suggestionFor(baseRows, draft, candidate);
    const noisy = suggestionFor(noisyRows, draft, candidate);
    const baseEstimate = estimateMissingEnemyPicks(base.matrix, draft, [base.suggestion], risk);
    const noisyEstimate = estimateMissingEnemyPicks(noisy.matrix, draft, [noisy.suggestion], risk);

    expect(noisyEstimate.suggestions[0]?.expectedRating)
      .toBe(baseEstimate.suggestions[0]?.expectedRating);
    expect(noisyEstimate.suggestions[0]?.counterpickRating)
      .toBe(baseEstimate.suggestions[0]?.counterpickRating);
  });
});
