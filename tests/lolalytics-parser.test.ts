import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ChampionNotFoundError,
  parseCounterResponse,
  parseTeamResponse,
  ResponseShapeError,
} from '@/features/draft/lolalytics/lolalytics-parser';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/lolalytics/${name}`, import.meta.url),
  'utf8',
);

describe('parser de Lolalytics', () => {
  it('lee una respuesta real de matchups', () => {
    const parsed = parseCounterResponse(fixture('counter-ahri-middle-vs-middle.json'));

    expect(parsed).toMatchObject({
      championKey: 103,
      role: 'middle',
      enemyRole: 'middle',
      analysed: 12_365_736,
      championWinRate: 52.86,
    });
    expect(parsed.counters).toHaveLength(78);
    expect(parsed.counters[0]).toEqual({
      championKey: 81,
      winRate: 65.2,
      games: 204,
      defaultRole: 'bottom',
    });
  });

  it('lee sinergias reales según team_h', () => {
    const parsed = parseTeamResponse(fixture('build-team-ahri-middle.json'));

    expect(parsed.synergies).toHaveLength(647);
    expect(parsed.synergies[0]).toEqual({
      championKey: 777,
      role: 'top',
      winRate: 52.9,
      games: 5261,
    });
  });

  it('lee una respuesta real de sinergias con muestra chica', () => {
    const parsed = parseTeamResponse(fixture('build-team-leona-middle.json'));

    expect(parsed.synergies).toEqual(expect.arrayContaining([
      { championKey: 122, role: 'top', winRate: 25, games: 4 },
      { championKey: 76, role: 'jungle', winRate: 66.67, games: 3 },
    ]));
  });

  it('no supone el orden de las columnas de team_h', () => {
    const parsed = parseTeamResponse(JSON.stringify({
      team_h: ['n', 'd1', 'id', 'wr'],
      team: { jungle: [[37, 1.2, 64, 55.5]] },
    }));

    expect(parsed.synergies).toEqual([{
      championKey: 64,
      role: 'jungle',
      winRate: 55.5,
      games: 37,
    }]);
  });

  it('acepta una lane sin datos como una respuesta legítima', () => {
    const parsed = parseCounterResponse(fixture('counter-leona-middle-vacio.json'));

    expect(parsed).toMatchObject({ championKey: 89, role: 'middle', counters: [] });
  });

  it('detecta el 404 enviado dentro de un body HTTP 200', () => {
    expect(() => parseCounterResponse(fixture('counter-campeon-inexistente.json')))
      .toThrow(ChampionNotFoundError);
  });

  it('envuelve el texto plano de un endpoint inválido', () => {
    expect(() => parseCounterResponse(fixture('invalid-end-point.txt')))
      .toThrow(ResponseShapeError);
  });
});
