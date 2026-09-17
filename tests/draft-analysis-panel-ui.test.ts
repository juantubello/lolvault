import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DraftAnalysisPanel } from '@/components/scout/draft-analysis-panel';
import {
  ratingToWinrate,
  winrateToRating,
  type ChampionAnalysis,
  type DraftAnalysis,
} from '@/features/draft/analysis';
import type { DraftUrlState } from '@/features/draft/draft-url';
import type { DraftScalingCurves } from '@/features/draft/scaling';

function champion(
  championKey: number,
  role: ChampionAnalysis['role'],
  rating: number,
): ChampionAnalysis {
  return {
    championKey,
    role,
    games: 2_000,
    wins: 1_000,
    rating,
    winrate: ratingToWinrate(rating),
    hasData: true,
  };
}

const analysis: DraftAnalysis = {
  allyChampionRating: winrateToRating(0.55),
  enemyChampionRating: winrateToRating(0.48),
  allyDuoRating: winrateToRating(0.3612),
  enemyDuoRating: winrateToRating(0.52),
  matchupRating: winrateToRating(0.2628),
  totalRating: winrateToRating(0.6128),
  winrate: 0.6128,
  allyChampions: [champion(1, 'top', 100), champion(2, 'jungle', -100)],
  enemyChampions: [champion(3, 'middle', 100), champion(4, 'bottom', -100)],
  allyDuos: [],
  enemyDuos: [],
  matchups: [],
};

const state: DraftUrlState = {
  allies: [],
  enemies: [],
  players: [],
  risk: 'medium',
  panel: 'analisis',
  matchupScope: 'head-to-head',
  slot: null,
};

const scaling: DraftScalingCurves = {
  allies: Array.from({ length: 7 }, (_, index) => ({ bucket: index + 1, winrate: 0.5 })),
  enemies: Array.from({ length: 7 }, (_, index) => ({ bucket: index + 1, winrate: 0.5 })),
};

function renderPanel(curves: DraftScalingCurves | null): string {
  return renderToStaticMarkup(createElement(DraftAnalysisPanel, {
    analysis,
    championImages: new Map(),
    championNames: new Map([[1, 'Olaf'], [2, 'Ashe'], [3, 'Garen'], [4, 'Lux']]),
    scaling: curves,
    searchParams: {},
    state,
  }));
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*%/g, ' %')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('secciones plegables del análisis de Draft', () => {
  it('muestra el número titular de cada sección en su encabezado', () => {
    const html = renderPanel(null);
    const text = visibleText(html);

    expect(html.match(/<summary>/g)).toHaveLength(4);
    expect(text).toContain('Resumen por lado · tu equipo 61,28 %');
    expect(text).toContain('Resumen por campeón · mejor Olaf y Garen · peor Ashe y Lux');
    expect(text).toContain('Cruces · tu equipo 26,28 %');
    expect(text).toContain('Duplas · tu equipo 36,12 %');
  });

  it('abre la primera sección cuando no hay gráfico de Scaling', () => {
    const html = renderPanel(null);
    const firstDetails = html.match(/<details[^>]*>/)?.[0];

    expect(firstDetails).toContain('open=""');
  });

  it('pone Scaling primero y deja los desplegables cerrados cuando hay gráfico', () => {
    const html = renderPanel(scaling);
    const firstDetails = html.match(/<details[^>]*>/)?.[0];

    expect(html.indexOf('id="draft-scaling-heading"')).toBeLessThan(html.indexOf('<details'));
    expect(firstDetails).not.toContain('open=""');
  });
});
