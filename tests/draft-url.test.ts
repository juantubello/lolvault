import { describe, expect, it } from 'vitest';

import {
  draftMatchupScopeHref,
  draftPanelHref,
  draftPickHref,
  draftRiskHref,
  draftSlotHref,
  parseDraftUrl,
  removeDraftPickHref,
  type DraftSearchParams,
} from '@/features/draft/draft-url';

const VALID_KEYS = new Set([64, 86, 103, 222, 412]);

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
    };
    const state = parseDraftUrl(params, VALID_KEYS);
    const href = draftSlotHref(params, state, state.slot);

    expect(parseDraftUrl(paramsFromHref(href), VALID_KEYS)).toEqual(state);
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
      risk: 'medium',
      panel: 'draft',
      matchupScope: 'head-to-head',
      slot: null,
    });
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
    ]) {
      const result = new URL(href, 'https://lolvault.local').searchParams;
      expect(result.get('q')).toBe('queda');
      expect(result.getAll('extra')).toEqual(['uno', 'dos']);
    }
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
});
