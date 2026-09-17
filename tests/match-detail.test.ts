import { describe, expect, it } from 'vitest';

import {
  csPerMinute,
  damageShare,
  findMemberForParticipant,
  killParticipation,
  matchBackHref,
  multiKillLabel,
  performanceBadge,
  sortParticipantsByPosition,
} from '@/features/matches/match-detail';

describe('detalle de partida', () => {
  it('ordena los jugadores por posición y deja roles desconocidos al final', () => {
    const participants = [
      { position: 'SUPPORT', name: 'support' },
      { position: null, name: 'sin rol' },
      { position: 'TOP', name: 'top' },
      { position: 'ADC', name: 'adc' },
      { position: 'JUNGLE', name: 'jungla' },
      { position: 'MID', name: 'mid' },
    ];

    expect(sortParticipantsByPosition(participants).map(({ name }) => name))
      .toEqual(['top', 'jungla', 'mid', 'adc', 'support', 'sin rol']);
  });

  it('calcula CS/min, porcentaje de daño y participación en kills sin dividir por cero', () => {
    expect(csPerMinute(240, 1_800)).toBe(8);
    expect(csPerMinute(50, 0)).toBe(0);
    expect(damageShare(25_000, 100_000)).toBe(0.25);
    expect(damageShare(10, 0)).toBe(0);
    expect(killParticipation(7, 8, 30)).toBe(0.5);
    expect(killParticipation(1, 1, 0)).toBe(0);
  });

  it.each([
    [undefined, null],
    [1, null],
    [2, 'Doble'],
    [3, 'Triple'],
    [4, 'Cuádruple'],
    [5, 'Pentakill'],
    [7, 'Pentakill'],
  ] as const)('etiqueta el multikill %s como %s', (count, label) => {
    expect(multiKillLabel(count)).toBe(label);
  });

  it('marca al puesto #1 como MVP o ACE según su equipo', () => {
    expect(performanceBadge({ opScoreRank: 1 }, true)).toBe('MVP');
    expect(performanceBadge({ opScoreRank: 1 }, false)).toBe('ACE');
    expect(performanceBadge({ opScoreRank: 2 }, true)).toBeNull();
  });

  it('construye el back solo desde destinos permitidos', () => {
    expect(matchBackHref(4, 4, null)).toBe('/perfil');
    expect(matchBackHref(4, 9, null)).toBe('/amigos/9');
    expect(matchBackHref(4, 9, 'votaciones')).toBe('/');
    expect(matchBackHref(4, 9, 'black-list')).toBe('/ripeados?tipo=black-list');
    expect(matchBackHref(4, 9, 'vaults')).toBe('/ripeados?tipo=vaults');
    expect(
      matchBackHref(4, 9, 'scout', { gameName: 'Rival Anónimo', tagLine: 'TAG1' }),
    ).toBe('/scout?jugador=Rival%20An%C3%B3nimo%23TAG1');
    expect(
      matchBackHref(4, 9, 'scout', { gameName: 'Rival Anónimo', tagLine: 'TAG1' }, 'KR'),
    ).toBe('/scout?jugador=Rival%20An%C3%B3nimo%23TAG1&region=KR');
    expect(matchBackHref(4, 9, 'https://ejemplo.test')).toBe('/amigos/9');
  });

  it('encuentra miembros por gameName#tag sin distinguir mayúsculas y nunca necesita puuid', () => {
    const members = [
      { id: 1, riotGameName: 'Invocador Uno', riotTagLine: 'LAS' },
      { id: 2, riotGameName: 'Otro', riotTagLine: 'LAS2' },
    ];

    expect(findMemberForParticipant({ gameName: 'invocador uno', tagLine: 'las' }, members)?.id).toBe(1);
    expect(findMemberForParticipant({ gameName: 'Nadie', tagLine: 'LAS' }, members)).toBeUndefined();
  });
});
