import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createOpggProvider } from '@/features/matches/opgg/opgg-provider';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/opgg/${name}`, import.meta.url),
  'utf8',
);

const riotId = { gameName: 'Invocador', tagLine: 'LAS1' };

const listFields = [
  'data.game_history[].{created_at,game_length_second,game_type,id}',
  'data.game_history[].participants[].{champion_id,champion_name,position,team_key}',
  'data.game_history[].participants[].stats.{assist,champion_level,death,kill,minion_kill,neutral_minion_kill,op_score,op_score_rank,result,total_damage_dealt_to_champions,total_damage_taken}',
  'data.game_history[].participants[].summoner.{game_name,puuid,tagline}',
  'data.game_history[].teams[].game_stat.{champion_kill,is_win}',
  'data.game_history[].teams[].key',
];

const detailFields = [
  'data.game_detail.{created_at,game_length_second,game_type,id}',
  'data.game_detail.teams[].key',
  'data.game_detail.teams[].game_stat.{champion_kill,gold_earned,is_win}',
  'data.game_detail.teams[].participants[].{champion_id,champion_name,is_target,position,team_key}',
  'data.game_detail.teams[].participants[].stats.{assist,champion_level,death,kill,minion_kill,neutral_minion_kill,op_score,op_score_rank,result,total_damage_dealt_to_champions,total_damage_taken}',
  'data.game_detail.teams[].participants[].summoner.{game_name,puuid,tagline}',
];

const profileFields = [
  'data.summoner.{game_name,level,profile_image_url,puuid,tagline,updated_at}',
  'data.summoner.league_stats[].{game_type,lose,win}',
  'data.summoner.league_stats[].tier_info.{division,lp,tier,tier_image_url}',
  'data.summoner.most_champions.{game_type,lose,play,season_id,win}',
  'data.summoner.most_champions.champion_stats[].{assist,champion_name,damage_dealt_to_champions,death,id,kill,lose,op_score,play,win}',
];

describe('proveedor de partidas OP.GG', () => {
  it('mapea las 20 partidas desde el punto de vista del invocador', async () => {
    const callTool = vi.fn(async () => fixture('list-20.txt'));
    const provider = createOpggProvider({ client: { callTool }, region: 'LAS' });

    const matches = await provider.listMatches(riotId, 99);

    expect(provider.name).toBe('opgg');
    expect(matches).toHaveLength(20);
    expect(matches[0]).toMatchObject({
      matchId: 'P9o6vts4cwlSlUT6WTBHhHFmIFOsPV-tUqaGTvDIV9Q=',
      championName: 'Malzahar',
      kills: 7,
      deaths: 6,
      assists: 5,
      damageDealt: 24108,
      damageTaken: 19354,
      cs: 267,
      teamKills: 26,
      win: true,
      puuid: 'puuid-invocador',
    });
    expect(matches[0]?.playedAt.toISOString()).toBe('2026-09-14T21:51:50.000Z');
    expect(callTool).toHaveBeenCalledWith('lol_list_summoner_matches', {
      game_name: 'Invocador',
      tag_line: 'LAS1',
      region: 'LAS',
      lang: 'en_US',
      limit: 20,
      desired_output_fields: listFields,
    });
  });

  it('mapea el detalle completo y envía la fecha UTC y el foco', async () => {
    const callTool = vi.fn(async () => fixture('detail.txt'));
    const provider = createOpggProvider({ client: { callTool } });
    const playedAt = new Date('2026-09-15T06:51:50+09:00');

    const detail = await provider.getMatchDetail('match-id', playedAt, riotId);

    expect(detail.teams).toHaveLength(2);
    expect(detail.teams.map((team) => team.participants)).toSatisfy(
      (teams: unknown[][]) => teams.every((participants) => participants.length === 5),
    );
    const participants = detail.teams.flatMap((team) => team.participants);
    expect(participants.filter((participant) => participant.isTarget)).toHaveLength(1);
    expect(participants.find((participant) => participant.isTarget)?.gameName).toBe('Invocador');
    expect(detail.teams.find((team) => team.key === 'BLUE')?.participants)
      .toEqual(expect.arrayContaining([expect.objectContaining({ championName: 'Darius' })]));
    expect(detail.playedAt).toBe('2026-09-14T21:51:50.000Z');
    expect(participants.find((participant) => participant.isTarget)?.goldEarned).toBe(14099);
    expect(callTool).toHaveBeenCalledWith('lol_get_summoner_game_detail', {
      region: 'LAS',
      lang: 'en_US',
      game_id: 'match-id',
      created_at: '2026-09-14T21:51:50.000Z',
      focus_riot_id: 'Invocador#LAS1',
      desired_output_fields: detailFields,
    });
  });

  it('mapea rangos y campeones de temporada respetando los nulls', async () => {
    const callTool = vi.fn(async () => fixture('profile.txt'));
    const provider = createOpggProvider({ client: { callTool } });

    const profile = await provider.getProfile(riotId);

    expect(profile.ranks.find((rank) => rank.queue === 'FLEXRANKED')).toMatchObject({
      tier: 'PLATINUM',
      division: 4,
      lp: 93,
      wins: 55,
      losses: 52,
    });
    expect(profile.ranks.find((rank) => rank.queue === 'SOLORANKED')).toMatchObject({
      tier: null,
      division: null,
      lp: null,
      wins: 0,
      losses: 0,
    });
    expect(profile.seasonChampions[0]).toMatchObject({
      championName: 'Malphite',
      games: 24,
      wins: 13,
      losses: 11,
    });
    expect(callTool).toHaveBeenCalledWith('lol_get_summoner_profile', {
      game_name: 'Invocador',
      tag_line: 'LAS1',
      region: 'LAS',
      lang: 'en_US',
      desired_output_fields: profileFields,
    });
  });

  it('clasifica una estructura inesperada como invalid-response', async () => {
    const callTool = vi.fn(async () => 'class Root: unexpected\nRoot(1)');
    const provider = createOpggProvider({ client: { callTool } });

    await expect(provider.listMatches(riotId, 5))
      .rejects.toMatchObject({ kind: 'invalid-response' });
  });
});
