import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DraftChampionGrid } from '@/components/scout/draft-champion-grid';

describe('grilla de sugerencias con rivales pendientes', () => {
  it('separa valor esperado, tablero actual, piso y riesgo con una alerta textual', () => {
    const html = renderToStaticMarkup(createElement(DraftChampionGrid, {
      champions: [{
        key: 1,
        name: 'Olaf',
        imageUrl: 'https://example.test/olaf.png',
        searchKey: 'olaf',
        href: '/scout?pick=1',
        kind: 'suggestion' as const,
        winrateLabel: '52,40 %',
        boardWinrateLabel: '54,00 %',
        counterpickWinrateLabel: '46,80 %',
        counterpickDropLabel: '−5,60 pp',
        notablyBadFloor: true,
        missingEnemyRoles: 2,
        matchupLabel: '+1,20 pp',
        synergyLabel: '+0,40 pp',
        personalLabel: 'Juan: 8-4 esta temporada',
        personalPlayed: true,
        personalBelowAverage: false,
      }],
      slotLabel: 'carril superior aliado',
      side: 'allies' as const,
      occupant: null,
      personalPlayerName: 'Juan',
    }));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    expect(text).toContain('No es el win rate del tablero actual.');
    expect(text).toContain('Valor esperado para tu equipo 52,40 %');
    expect(text).toContain('Tablero actual 54,00 %');
    expect(text).toContain('Piso de contrapick 46,80 % Riesgo −5,60 pp');
    expect(text).toContain('Piso notablemente malo');
    expect(html).toContain('data-bad-floor="true"');
  });
});
