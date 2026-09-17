import { describe, expect, it } from 'vitest';

import {
  clearDraftHref,
  draftMatchupScopeHref,
  draftPanelHref,
  draftPickHref,
  draftPlayerHref,
  draftRiskHref,
  draftSlotHref,
  parseDraftUrl,
  removeDraftPickHref,
  type DraftSearchParams,
} from '@/features/draft/draft-url';
import { analyzeDraft, buildDraftMatrix } from '@/features/draft/analysis';

const VALID_KEYS = new Set([64, 86, 103, 222, 412]);
const VALID_USERS = new Set([3, 7, 11]);

function paramsFromHref(href: string): DraftSearchParams {
  const url = new URL(href, 'https://lolvault.local');
  const params: DraftSearchParams = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    params[key] = values.length === 1 ? values[0] : values;
  }
  return params;
}

describe('estado de Draft en la URL', () => {
  it('hace round-trip de un draft válido', () => {
    const params = {
      tipo: 'draft',
      aliados: '86-top,64-jungle,103-middle',
      enemigos: '222-bottom,412-support',
      riesgo: 'high',
      panel: 'analisis',
      cruces: 'todos',
      slot: 'aliado-middle',
      jugadores: 'top-3,middle-7',
    };
    const state = parseDraftUrl(params, VALID_KEYS, VALID_USERS);
    const href = draftSlotHref(params, state, state.slot);

    expect(parseDraftUrl(paramsFromHref(href), VALID_KEYS, VALID_USERS)).toEqual(state);
  });

  it('descarta roles repetidos, keys inexistentes, roles inválidos y campeones repetidos entre equipos', () => {
    const state = parseDraftUrl({
      aliados: '103-middle,64-middle,999-top,86-unknown,malformado',
      enemigos: '103-top,64-jungle,222-bottom',
      riesgo: 'suicida',
      panel: 'scaling',
      slot: 'rival-mid',
    }, VALID_KEYS);

    expect(state).toEqual({
      allies: [{ championKey: 103, role: 'middle' }],
      enemies: [
        { championKey: 64, role: 'jungle' },
        { championKey: 222, role: 'bottom' },
      ],
      players: [],
      risk: 'medium',
      panel: 'draft',
      matchupScope: 'head-to-head',
      slot: null,
    });
  });

  it('descarta ids inexistentes, roles inválidos, roles repetidos y una persona en dos casilleros', () => {
    const state = parseDraftUrl({
      jugadores: 'top-3,middle-999,mid-7,top-7,jungle-3,support-11',
    }, VALID_KEYS, VALID_USERS);

    expect(state.players).toEqual([
      { role: 'top', userId: 3 },
      { role: 'support', userId: 11 },
    ]);
  });

  it('los helpers preservan parámetros ajenos y mantienen el draft válido', () => {
    const params = {
      tipo: 'draft',
      aliados: '103-middle,64-jungle',
      enemigos: '222-bottom',
      q: 'queda',
      extra: ['uno', 'dos'],
    };
    const state = parseDraftUrl(params, VALID_KEYS);
    const slot = { team: 'allies', role: 'top' } as const;
    const picked = draftPickHref(params, state, slot, 86);
    const pickedParams = new URL(picked, 'https://lolvault.local').searchParams;

    expect(pickedParams.get('q')).toBe('queda');
    expect(pickedParams.getAll('extra')).toEqual(['uno', 'dos']);
    expect(parseDraftUrl(Object.fromEntries(pickedParams.entries()), VALID_KEYS).allies).toEqual([
      { championKey: 86, role: 'top' },
      { championKey: 64, role: 'jungle' },
      { championKey: 103, role: 'middle' },
    ]);

    const nextState = parseDraftUrl(paramsFromHref(picked), VALID_KEYS);
    for (const href of [
      removeDraftPickHref(paramsFromHref(picked), nextState, slot),
      draftRiskHref(params, state, 'very-high'),
      draftPanelHref(params, state, 'analisis'),
      draftMatchupScopeHref(params, state, 'all'),
      draftPlayerHref(params, state, 'middle', 7),
    ]) {
      const result = new URL(href, 'https://lolvault.local').searchParams;
      expect(result.get('q')).toBe('queda');
      expect(result.getAll('extra')).toEqual(['uno', 'dos']);
    }
  });

  it('asignar una persona no cambia exactamente el número estimado del draft', () => {
    const matrix = buildDraftMatrix({
      championKeys: [64, 86, 103, 222, 412],
      championStats: [
        { championKey: 86, role: 'top', games: 10_000, wins: 5_300 },
        { championKey: 103, role: 'middle', games: 10_000, wins: 5_100 },
        { championKey: 222, role: 'bottom', games: 10_000, wins: 4_900 },
      ],
      matchups: [],
      synergies: [],
    });
    const params = { aliados: '86-top,103-middle', enemigos: '222-bottom' };
    const withoutPlayers = parseDraftUrl(params, VALID_KEYS, VALID_USERS);
    const withPlayers = parseDraftUrl({
      ...params,
      jugadores: 'top-3,middle-7',
    }, VALID_KEYS, VALID_USERS);

    expect(analyzeDraft(matrix, withPlayers, withPlayers.risk).winrate).toBe(
      analyzeDraft(matrix, withoutPlayers, withoutPlayers.risk).winrate,
    );
  });

  it('parsea el alcance de cruces y serializa sólo el valor no predeterminado', () => {
    const all = parseDraftUrl({ tipo: 'draft', panel: 'analisis', cruces: 'todos' }, VALID_KEYS);
    const invalid = parseDraftUrl({ cruces: 'cualquiera' }, VALID_KEYS);

    expect(all.matchupScope).toBe('all');
    expect(invalid.matchupScope).toBe('head-to-head');
    expect(new URL(
      draftMatchupScopeHref({}, invalid, 'all'),
      'https://lolvault.local',
    ).searchParams.get('cruces')).toBe('todos');
    expect(new URL(
      draftMatchupScopeHref({ cruces: 'todos' }, all, 'head-to-head'),
      'https://lolvault.local',
    ).searchParams.has('cruces')).toBe(false);
  });

  it('conserva la captura al corregir un pick y la descarta al vaciar todo', () => {
    const params = {
      tipo: 'draft',
      aliados: '86-top,64-jungle',
      enemigos: '222-bottom',
      captura: 'comprobante-firmado',
    };
    const state = parseDraftUrl(params, VALID_KEYS);
    const changed = draftPickHref(params, state, { team: 'allies', role: 'middle' }, 103);
    const cleared = new URL(clearDraftHref(params, state), 'https://lolvault.local');

    expect(new URL(changed, 'https://lolvault.local').searchParams.get('captura'))
      .toBe('comprobante-firmado');
    expect(cleared.searchParams.has('captura')).toBe(false);
  });
});
