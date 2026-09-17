import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { champions, draftChampionStats, draftMatchups, draftSynergies } from '@/db/schema';
import {
  analyzeDraft,
  analyzeDuo,
  analyzeMatchup,
  DRAFT_PRIOR_GAMES,
  getSuggestions,
  ratingToWinrate,
  winrateToRating,
  type DraftPick,
} from '@/features/draft/analysis';
import { loadDraftMatrix } from '@/features/draft/analysis-data';
import type { DraftRole } from '@/features/draft/types';

const UPDATED_AT = new Date('2026-09-16T12:00:00-03:00');

let sqlite: Database.Database;
let db: Db;

function addChampion(key: number): void {
  db.insert(champions).values({
    id: `Champion${key}`,
    key,
    name: `Champion ${key}`,
    title: 'campeón de prueba',
    imageFile: `Champion${key}.png`,
    version: '16.18.1',
  }).run();
}

function addStat(pick: DraftPick, games: number, wins: number): void {
  db.insert(draftChampionStats).values({
    ...pick,
    games,
    wins,
    patchWindow: '30',
    updatedAt: UPDATED_AT,
  }).run();
}

function addMatchup(
  first: DraftPick,
  second: DraftPick,
  games: number,
  wins: number,
): void {
  db.insert(draftMatchups).values({
    ...first,
    enemyChampionKey: second.championKey,
    enemyRole: second.role,
    games,
    wins,
  }).run();
}

function addSynergy(
  first: DraftPick,
  second: DraftPick,
  games: number,
  wins: number,
): void {
  db.insert(draftSynergies).values({
    ...first,
    allyChampionKey: second.championKey,
    allyRole: second.role,
    games,
    wins,
  }).run();
}

describe('motor de análisis de Draft', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('usa Elo 400 y los cinco priors de riesgo de DraftGap', () => {
    expect(ratingToWinrate(0)).toBe(0.5);
    expect(ratingToWinrate(400)).toBeCloseTo(10 / 11, 12);
    expect(winrateToRating(10 / 11)).toBeCloseTo(400, 12);
    expect(DRAFT_PRIOR_GAMES).toEqual({
      'very-low': 3_000,
      low: 2_000,
      medium: 1_000,
      high: 500,
      'very-high': 250,
    });
  });

  it('un matchup simétrico da rating cero aunque las dos direcciones vengan infladas', () => {
    const ally = { championKey: 1, role: 'middle' } as const;
    const enemy = { championKey: 2, role: 'middle' } as const;
    addChampion(1);
    addChampion(2);
    addStat(ally, 10_000, 5_000);
    addStat(enemy, 10_000, 5_000);
    // La fuente dice 60 % en ambas direcciones. Invertir la segunda deja (60 + 40) / 2 = 50.
    addMatchup(ally, enemy, 100, 60);
    addMatchup(enemy, ally, 100, 60);

    const matchup = analyzeMatchup(loadDraftMatrix(db), ally, enemy);

    expect(matchup.games).toBe(100);
    expect(matchup.wins).toBe(50);
    expect(matchup.rating).toBeCloseTo(0, 12);
    expect(matchup.winrate).toBeCloseTo(0.5, 12);
  });

  it('el prior aplasta 12 partidas perfectas y no deja que dominen el ranking', () => {
    const tiny = { championKey: 1, role: 'top' } as const;
    const reliable = { championKey: 2, role: 'top' } as const;
    const enemy = { championKey: 3, role: 'top' } as const;
    for (const key of [1, 2, 3]) addChampion(key);
    for (const pick of [tiny, reliable, enemy]) addStat(pick, 10_000, 5_000);
    addMatchup(tiny, enemy, 12, 12);
    addMatchup(enemy, tiny, 12, 0);
    addMatchup(reliable, enemy, 1_000, 550);
    addMatchup(enemy, reliable, 1_000, 450);

    const matrix = loadDraftMatrix(db);
    const tinyResult = analyzeMatchup(matrix, tiny, enemy);
    const reliableResult = analyzeMatchup(matrix, reliable, enemy);
    const top = getSuggestions(matrix, { allies: [], enemies: [enemy] }, { topN: 2 })
      .find(({ role }) => role === 'top');

    // A mano: (12 + 1000 * 0,5) / 1012 = 50,59 %, contra 52,50 % del dato robusto.
    expect(tinyResult.winrate).toBeCloseTo(512 / 1_012, 12);
    expect(reliableResult.winrate).toBeCloseTo(1_050 / 2_000, 12);
    expect(top?.suggestions.map(({ championKey }) => championKey)).toEqual([2, 1]);
  });

  it('no cruza la resta de matchups con la suma de duplas', () => {
    const strong = { championKey: 1, role: 'top' } as const;
    const weak = { championKey: 2, role: 'jungle' } as const;
    addChampion(1);
    addChampion(2);
    // Con prior medium=1000 quedan exactamente 10/11 y 1/11: ratings +400 y -400.
    addStat(strong, 10_000, 9_500);
    addStat(weak, 10_000, 500);
    // Matchup esperado por RESTA: +400 - (-400) = +800 => 100/101.
    addMatchup(strong, weak, 101, 100);
    addMatchup(weak, strong, 101, 1);
    // Dupla esperada por SUMA: +400 + (-400) = 0 => 50 %.
    addSynergy(strong, weak, 100, 50);
    addSynergy(weak, strong, 100, 50);

    const matrix = loadDraftMatrix(db);
    const matchup = analyzeMatchup(matrix, strong, weak);
    const duo = analyzeDuo(matrix, strong, weak);

    expect(matchup.expectedRating).toBeCloseTo(800, 10);
    expect(matchup.expectedWinrate).toBeCloseTo(100 / 101, 12);
    expect(matchup.rating).toBeCloseTo(0, 10);
    expect(duo.expectedRating).toBeCloseTo(0, 10);
    expect(duo.expectedWinrate).toBeCloseTo(0.5, 12);
    expect(duo.rating).toBeCloseTo(0, 10);
  });

  it('un par ausente, o con una sola dirección, cae a neutro', () => {
    const first = { championKey: 1, role: 'bottom' } as const;
    const second = { championKey: 2, role: 'support' } as const;
    addChampion(1);
    addChampion(2);
    addStat(first, 1_000, 520);
    addStat(second, 1_000, 480);
    addMatchup(first, second, 100, 90);

    const matrix = loadDraftMatrix(db);
    const matchup = analyzeMatchup(matrix, first, second);
    const duo = analyzeDuo(matrix, first, second);

    expect(matchup).toMatchObject({ hasData: false, games: 0, wins: 0, rating: 0, winrate: 0.5 });
    expect(duo).toMatchObject({ hasData: false, games: 0, wins: 0, rating: 0, winrate: 0.5 });
  });

  it('una composición espejo completa da exactamente 50 % con relaciones no neutras', () => {
    const roles: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support'];
    const picks = roles.map((role, index) => ({ championKey: index + 1, role }));
    picks.forEach((pick, index) => {
      addChampion(pick.championKey);
      addStat(pick, 10_000, 4_800 + index * 100);
    });

    for (let first = 0; first < picks.length; first += 1) {
      for (let second = 0; second < picks.length; second += 1) {
        if (first === second) continue;
        const firstPick = picks[first];
        const secondPick = picks[second];
        if (!firstPick || !secondPick) continue;
        const games = 500 + first + second;
        addMatchup(firstPick, secondPick, games, Math.round(games * (
          0.52 + (first - second) * 0.002
        )));
        addSynergy(firstPick, secondPick, 400, 204 + first - second);
      }
    }

    const analysis = analyzeDraft(loadDraftMatrix(db), { allies: picks, enemies: picks });

    expect(analysis.allyDuos).toHaveLength(10);
    expect(analysis.enemyDuos).toHaveLength(10);
    expect(analysis.matchups).toHaveLength(25);
    expect(analysis.totalRating).toBe(0);
    expect(analysis.winrate).toBe(0.5);
  });
});
