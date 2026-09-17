import { describe, expect, it } from 'vitest';

import {
  getPersonalChampionStat,
  PERSONAL_STAT_SMALL_SAMPLE_GAMES,
  personalChampionLabel,
} from '@/features/draft/player-champion';
import type { RankedSeasonChampion, SummonerProfile } from '@/features/matches/types';

function profileWithRanked(
  championGames: number,
  championWins: number,
): SummonerProfile {
  return {
    puuid: 'puuid-test',
    gameName: 'Jugador',
    tagLine: 'TEST',
    level: 1,
    profileImageUrl: null,
    ranks: [],
    seasonChampions: [],
    rankedSeason: {
      queue: 'RANKED',
      seasonId: 33,
      games: 100,
      wins: 50,
      losses: 50,
      champions: [{
        championId: 103,
        championName: 'Ahri',
        games: championGames,
        wins: championWins,
        losses: championGames - championWins,
      } as unknown as RankedSeasonChampion],
    },
  };
}

describe('señal personal por campeón', () => {
  it('con tres partidas queda pegada al promedio y con 25 se despega de verdad', () => {
    const tiny = getPersonalChampionStat(profileWithRanked(3, 3), 103, 'very-high');
    const established = getPersonalChampionStat(profileWithRanked(25, 25), 103, 'very-high');

    expect(tiny.status).toBe('played');
    expect(established.status).toBe('played');
    if (tiny.status !== 'played' || established.status !== 'played') return;
    expect(Math.abs(tiny.difference)).toBeLessThan(0.01);
    expect(established.difference).toBeGreaterThan(0.04);
    expect(established.difference).toBeGreaterThan(tiny.difference * 5);
    expect(tiny.smallSample).toBe(true);
    expect(PERSONAL_STAT_SMALL_SAMPLE_GAMES).toBe(10);
  });

  it('sin perfil cacheado y fuera del top de temporada devuelve ausencia, nunca un 50 % inventado', () => {
    const noProfile = getPersonalChampionStat(null, 103, 'medium');
    const notPlayed = getPersonalChampionStat(profileWithRanked(25, 14), 222, 'medium');

    expect(noProfile).toEqual({ status: 'no-profile' });
    expect(notPlayed).toEqual({ status: 'not-played' });
    expect(personalChampionLabel('Amigo', noProfile)).toBe('Amigo: sin datos de temporada');
    expect(personalChampionLabel('Amigo', notPlayed)).toBe('Amigo no lo jugó esta temporada');
  });

  it('usa seasonChampions como respaldo cuando rankedSeason todavía no está cacheado', () => {
    const profile: SummonerProfile = {
      puuid: 'puuid-viejo',
      gameName: 'Jugador',
      tagLine: 'TEST',
      level: null,
      profileImageUrl: null,
      ranks: [{
        queue: 'SOLORANKED',
        tier: 'GOLD',
        division: 2,
        lp: 20,
        wins: 55,
        losses: 45,
        tierImageUrl: null,
      }],
      seasonChampions: [{
        championId: 86,
        championName: 'Garen',
        games: 20,
        wins: 13,
        losses: 7,
        kills: 100,
        deaths: 80,
        assists: 90,
        damageDealt: null,
        opScore: null,
      }],
    };

    const result = getPersonalChampionStat(profile, 86, 'high');

    expect(result).toMatchObject({
      status: 'played',
      games: 20,
      wins: 13,
      losses: 7,
      smallSample: false,
    });
  });

  it('no publica porcentaje para una muestra chica', () => {
    const result = getPersonalChampionStat(profileWithRanked(3, 1), 103, 'medium');

    expect(personalChampionLabel('Amigo', result)).toBe(
      'Amigo: 1-2 esta temporada · muestra chica',
    );
  });
});
